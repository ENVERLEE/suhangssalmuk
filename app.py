from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import requests
import json
import os
from werkzeug.utils import secure_filename
import logging
from logging.handlers import RotatingFileHandler
import uuid
import PyPDF2
from PIL import Image
import pytesseract
import pdf2image
from dotenv import load_dotenv
from sqlalchemy import func, or_  # dashboard_stats와 search_projects에 필요한 import
from flask import send_file  # 파일 다운로드를 위한 import

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///research.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB
app.config['ALLOWED_EXTENSIONS'] = {'pdf', 'png', 'jpg', 'jpeg'}

# Ensure required directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('logs', exist_ok=True)

# Setup logging
if not app.debug:
    file_handler = RotatingFileHandler(
        'logs/research_automation.log',
        maxBytes=10240,
        backupCount=10
    )
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
    ))
    file_handler.setLevel(logging.INFO)
    app.logger.addHandler(file_handler)
    app.logger.setLevel(logging.INFO)
    app.logger.info('Research Automation startup')

# Initialize SQLAlchemy
db = SQLAlchemy(app)

# Database Models
class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    evaluation_plan = db.Column(db.Text, nullable=False)
    evaluation_plan_file = db.Column(db.String(500))
    submission_format = db.Column(db.Text, nullable=False)
    submission_format_file = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    research_steps = db.relationship('ResearchStep', backref='project', lazy=True)
    references = db.relationship('Reference', backref='project', lazy=True)

class ResearchStep(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    step_number = db.Column(db.Integer, nullable=False)
    description = db.Column(db.Text, nullable=False)
    keywords = db.Column(db.Text, nullable=False)
    methodology = db.Column(db.Text, nullable=False)
    output_format = db.Column(db.Text, nullable=False)
    result = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)  # 추가된 필드

class Reference(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    url = db.Column(db.String(500), nullable=False)
    metavalue = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# OpenAI API Integration
class OpenAIService:
    def __init__(self):
        self.api_key = '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'
        self.base_url = "https://api.perplexity.ai"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def search_papers(self, keywords, num_results=5):
        """OpenAI API를 사용한 논문 검색"""
        try:
            # Search API 엔드포인트
            url = f"{self.base_url}"

            # 검색 쿼리 구성
            query = f"academic papers about {' '.join(keywords)}"
            
            payload = {
                "prompt": query,
                "max_tokens": 100,
                "temperature": 0.3,
                "top_p": 1,
                "n": num_results,
                "search_model": "llama-3.1-sonar-large-128k-online"
            }

            response = requests.post(
                url,
                headers= {
            "Authorization": f"Bearer ",
            "Content-Type": "application/json"
                },
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                results = response.json()['data']
                processed_results = []
                
                for result in results:
                    # 각 검색 결과에 대해 추가 정보 요청
                    details = self.get_paper_details(result['text'])
                    if details:
                        processed_results.append({
                            'title': details.get('title', '제목 없음'),
                            'content': details.get('content', ''),
                            'url': details.get('url', ''),
                            'metavalue': {
                                'authors': details.get('authors', []),
                                'year': details.get('year', ''),
                                'journal': details.get('journal', ''),
                                'abstract': details.get('abstract', '')
                            }
                        })

                return processed_results
            else:
                app.logger.error(f"API 호출 실패: Status Code {response.status_code}")
                return []

        except Exception as e:
            app.logger.error(f"논문 검색 중 오류 발생: {str(e)}")
            return []

    def get_paper_details(self, paper_text):
        """논문 세부 정보 추출"""
        try:
            url = f"https://api.groq.com/openai/v1/chat/completions"
            
            prompt = f"""
            다음 논문 텍스트에서 세부 정보를 추출하여 JSON 형식으로 반환해주세요:

            {paper_text}

            다음 형식으로 반환:
            {{
                "title": "논문 제목",
                "authors": ["저자1", "저자2"],
                "year": "출판년도",
                "journal": "저널명",
                "abstract": "초록",
                "content": "전체 내용",
                "url": "논문 URL"
            }}
            """

            payload = {
                "model": "gemma2-9b-it",
                "messages": [
                    {"role": "system", "content": "You are a research paper information extractor."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3
            }

            response = requests.post(
                url,
                headers=self.headers,
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                content = response.json()['choices'][0]['message']['content']
                return json.loads(content)
            else:
                app.logger.error(f"논문 상세 정보 추출 실패: Status Code {response.status_code}")
                return None

        except Exception as e:
            app.logger.error(f"논문 상세 정보 추출 중 오류 발생: {str(e)}")
            return None

    def generate_research_plan(self, evaluation_plan, submission_format):
        """연구 계획 생성"""
        try:
            url = f"https://api.groq.com/openai/v1/chat/completions"
            
            prompt = (
                "너는 이제부터 한국의 안보 전문 연구자가 되어 특정 연구역량 평가를 보게될거야. 너가 이 평가를 통과하지 않으면 큰 불이익을 받게돼. 평가 계획안과 제출양식을 보내줄테니, 연구 과정을 세세하게 순서대로 짜주고 그 과정마다 필요한 참고자료를 찾을때 필요한 keyword와 연구 방법을 같이 제시해주세요.\n"
                "각 단계는 다음 속성을 포함해야 합니다: description(설명), keywords(핵심 키워드), "
                "methodology(연구 방법), output_format(결과물 양식)\n\n"
                f"평가계획서:\n{evaluation_plan}\n\n"
                f"제출양식:\n{submission_format}"
            )

            payload = {
                "model": "gemma2-9b-it",
                "messages": [
                    {"role": "system", "content": "You are a research planning assistant."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7
            }

            response = requests.post(
                url,
                headers=self.headers,
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                content = response.json()['choices'][0]['message']['content']
                # JSON 형식 검증
                json.loads(content)
                return content
            else:
                app.logger.error(f"연구 계획 생성 실패: Status Code {response.status_code}")
                return None

        except Exception as e:
            app.logger.error(f"연구 계획 생성 중 오류 발생: {str(e)}")
            return None

    def execute_research_step(self, step_description, methodology, output_format, references):
        """연구 단계 실행"""
        try:
            url = f"https://api.groq.com/openai/v1/chat/completions"
            
            # 참고문헌 컨텍스트 구성
            context = "참고문헌:\n" + "\n".join(references) if references else ""
            
            prompt = (
                "다음 연구 단계를 수행해주세요. 제시된 참고문헌을 활용하여 결과를 도출하세요.\n\n"
                f"단계 설명: {step_description}\n"
                f"연구 방법: {methodology}\n"
                f"결과물 양식: {output_format}\n\n"
                f"참고문헌:\n{context}"
            )

            payload = {
                "model": "gemma2-9b-it",
                "messages": [
                    {"role": "system", "content": "You are a research assistant performing research steps."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7
            }

            response = requests.post(
                url,
                headers=self.headers,
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                return response.json()['choices'][0]['message']['content']
            else:
                app.logger.error(f"연구 단계 실행 실패: Status Code {response.status_code}")
                return None

        except Exception as e:
            app.logger.error(f"연구 단계 실행 중 오류 발생: {str(e)}")
            return None

    def generate_final_report(self, submission_format, research_results):
        """최종 보고서 생성"""
        try:
            url = f"https://api.groq.com/openai/v1/chat/completions"
            
            prompt = (
                "다음 연구 결과들을 제출 양식에 맞게 최종 보고서로 가공해주세요.\n\n"
                f"제출 양식:\n{submission_format}\n\n"
                f"연구 결과:\n{json.dumps(research_results, ensure_ascii=False, indent=2)}"
            )

            payload = {
                "model": "gemma2-9b-it",
                "messages": [
                    {"role": "system", "content": "You are a research report generator."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7
            }

            response = requests.post(
                url,
                headers=self.headers,
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                return response.json()['choices'][0]['message']['content']
            else:
                app.logger.error(f"최종 보고서 생성 실패: Status Code {response.status_code}")
                return None

        except Exception as e:
            app.logger.error(f"최종 보고서 생성 중 오류 발생: {str(e)}")
            return None

# Initialize OpenAI Service
ai_service = OpenAIService()

# Utility Functions
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def process_pdf(file_path):
    """PDF 파일에서 텍스트 추출"""
    try:
        text = ""
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text.strip():
                    text += page_text + "\n"
                else:
                    images = pdf2image.convert_from_path(file_path)
                    for image in images:
                        text += pytesseract.image_to_string(image, lang='kor+eng') + "\n"
        return text.strip()
    except Exception as e:
        app.logger.error(f"PDF 처리 중 오류 발생: {str(e)}")
        return None

def process_image(file_path):
    """이미지 파일에서 텍스트 추출 (OCR)"""
    try:
        image = Image.open(file_path)
        text = pytesseract.image_to_string(image, lang='kor+eng')
        return text.strip()
    except Exception as e:
        app.logger.error(f"이미지 처리 중 오류 발생: {str(e)}")
        return None

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/process-file', methods=['POST'])
def process_file():
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': '파일이 없습니다.'})
    
    file = request.files['file']
    file_type = request.form.get('type')
    
    if file.filename == '':
        return jsonify({'success': False, 'error': '선택된 파일이 없습니다.'})
    
    if file and allowed_file(file.filename):
        try:
            filename = secure_filename(f"{uuid.uuid4()}_{file.filename}")
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            if file.filename.lower().endswith('.pdf'):
                extracted_text = process_pdf(file_path)
            else:
                extracted_text = process_image(file_path)
            
            if not extracted_text:
                return jsonify({'success': False, 'error': '텍스트 추출 실패'})
            
            return jsonify({
                'success': True,
                'text': extracted_text,
                'filename': filename,
                'type': file_type
            })
            
        except Exception as e:
            app.logger.error(f"파일 처리 중 오류 발생: {str(e)}")
            return jsonify({'success': False, 'error': str(e)})
    
    return jsonify({'success': False, 'error': '허용되지 않는 파일 형식입니다.'})

@app.route('/api/project', methods=['POST'])
def create_project():
    try:
        data = request.json
        research_plan = ai_service.generate_research_plan(
            data.get('evaluation_plan'),
            data.get('submission_format')
        )
        
        if not research_plan:
            return jsonify({'success': False, 'error': '연구 계획 생성 실패'})

        project = Project(
            title=data.get('title'),
            evaluation_plan=data.get('evaluation_plan'),
            evaluation_plan_file=data.get('evaluation_plan_file'),
            submission_format=data.get('submission_format'),
            submission_format_file=data.get('submission_format_file')
        )
        db.session.add(project)
        db.session.commit()

        steps = json.loads(research_plan)
        for i, step in enumerate(steps, 1):
            research_step = ResearchStep(
                project_id=project.id,
                step_number=i,
                description=step['description'],
                keywords=step['keywords'],
                methodology=step['methodology'],
                output_format=step['output_format']
            )
            db.session.add(research_step)

            # OpenAI Search를 사용하여 논문 검색
            keywords = step['keywords'].split(',')
            references = ai_service.search_papers(keywords)
            
            for ref in references:
                reference = Reference(
                    project_id=project.id,
                    title=ref['title'],
                    content=ref['content'],
                    url=ref['url'],
                    metavalue=json.dumps(ref['metavalue'])
                )
                db.session.add(reference)

        db.session.commit()
        return jsonify({'success': True, 'project_id': project.id})

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"프로젝트 생성 중 오류 발생: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/research/<int:project_id>/step/<int:step_number>', methods=['POST'])
def execute_research_step(project_id, step_number):
    try:
        project = Project.query.get_or_404(project_id)
        step = ResearchStep.query.filter_by(
            project_id=project_id,
            step_number=step_number
        ).first_or_404()

        references = Reference.query.filter_by(project_id=project_id).all()
        reference_texts = []
        for ref in references:
            ref_data = {
                'title': ref.title,
                'content': ref.content,
                'metavalue': json.loads(ref.metavalue) if ref.metavalue else {}
            }
            reference_texts.append(json.dumps(ref_data, ensure_ascii=False))

        result = ai_service.execute_research_step(
            step.description,
            step.methodology,
            step.output_format,
            reference_texts
        )

        if not result:
            return jsonify({'success': False, 'error': '연구 단계 실행 실패'})

        step.result = result
        db.session.commit()

        return jsonify({'success': True, 'result': result})

    except Exception as e:
        app.logger.error(f"연구 단계 실행 중 오류 발생: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/research/<int:project_id>/finalize', methods=['POST'])
def finalize_research(project_id):
    try:
        project = Project.query.get_or_404(project_id)
        steps = ResearchStep.query.filter_by(project_id=project_id).all()

        results = []
        for step in steps:
            results.append({
                'step_number': step.step_number,
                'description': step.description,
                'result': step.result
            })

        final_report = ai_service.generate_final_report(
            project.submission_format,
            results
        )

        if not final_report:
            return jsonify({'success': False, 'error': '최종 보고서 생성 실패'})

        return jsonify({
            'success': True,
            'final_report': final_report
        })

    except Exception as e:
        app.logger.error(f"최종 보고서 생성 중 오류 발생: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/research/<int:project_id>/steps', methods=['GET'])
def get_research_steps(project_id):
    try:
        steps = ResearchStep.query.filter_by(project_id=project_id).all()
        steps_data = [{
            'step_number': step.step_number,
            'description': step.description,
            'methodology': step.methodology,
            'keywords': step.keywords,
            'result': step.result
        } for step in steps]
        
        return jsonify({
            'success': True,
            'steps': steps_data
        })
        
    except Exception as e:
        app.logger.error(f"연구 단계 조회 중 오류 발생: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})
    
# 기존 app.py 파일에 추가할 라우트

@app.route('/dashboard')
def dashboard():
    """대시보드 메인 페이지"""
    try:
        # 전체 프로젝트 통계
        total_projects = Project.query.count()
        completed_projects = Project.query.filter(
            Project.research_steps.any(ResearchStep.result != None)
        ).distinct().count()
        
        # 최근 프로젝트
        recent_projects = Project.query.order_by(Project.created_at.desc()).limit(5).all()
        
        # 진행 중인 프로젝트
        active_projects = db.session.query(Project).join(ResearchStep).filter(
            ResearchStep.result == None
        ).distinct().all()

        return render_template('dashboard.html',
            total_projects=total_projects,
            completed_projects=completed_projects,
            recent_projects=recent_projects,
            active_projects=active_projects
        )
    except Exception as e:
        app.logger.error(f"대시보드 로딩 중 오류 발생: {str(e)}")
        return render_template('error.html', error="대시보드를 불러오는 중 오류가 발생했습니다.")

@app.route('/api/dashboard/stats')
def dashboard_stats():
    """대시보드 통계 API"""
    try:
        # 프로젝트 통계
        total_projects = Project.query.count()
        completed_projects = Project.query.filter(
            Project.research_steps.any(ResearchStep.result != None)
        ).distinct().count()
        
        # 월별 프로젝트 수
        month_stats = db.session.query(
            func.strftime('%Y-%m', Project.created_at).label('month'),
            func.count(Project.id).label('count')
        ).group_by('month').order_by('month').all()
        
        # 평균 완료 시간
        avg_completion_time = db.session.query(
            func.avg(
                func.julianday(ResearchStep.updated_at) - 
                func.julianday(Project.created_at)
            )
        ).join(Project).filter(ResearchStep.result != None).scalar()

        return jsonify({
            'success': True,
            'stats': {
                'total_projects': total_projects,
                'completed_projects': completed_projects,
                'completion_rate': (completed_projects / total_projects * 100) if total_projects > 0 else 0,
                'monthly_projects': [{'month': m, 'count': c} for m, c in month_stats],
                'avg_completion_days': round(avg_completion_time, 1) if avg_completion_time else 0
            }
        })
    except Exception as e:
        app.logger.error(f"대시보드 통계 조회 중 오류 발생: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/dashboard/projects/<int:project_id>/progress')
def project_progress(project_id):
    """프로젝트 진행 상황 API"""
    try:
        project = Project.query.get_or_404(project_id)
        steps = ResearchStep.query.filter_by(project_id=project_id).all()
        
        total_steps = len(steps)
        completed_steps = sum(1 for step in steps if step.result is not None)
        
        return jsonify({
            'success': True,
            'progress': {
                'project_id': project_id,
                'total_steps': total_steps,
                'completed_steps': completed_steps,
                'percentage': (completed_steps / total_steps * 100) if total_steps > 0 else 0
            }
        })
    except Exception as e:
        app.logger.error(f"프로젝트 진행 상황 조회 중 오류 발생: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/dashboard/search')
def search_projects():
    """프로젝트 검색 API"""
    try:
        query = request.args.get('q', '')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        projects = Project.query.filter(
            or_(
                Project.title.ilike(f'%{query}%'),
                Project.evaluation_plan.ilike(f'%{query}%')
            )
        ).paginate(page=page, per_page=per_page, error_out=False)
        
        return jsonify({
            'success': True,
            'projects': [{
                'id': p.id,
                'title': p.title,
                'created_at': p.created_at.isoformat(),
                'total_steps': len(p.research_steps),
                'completed_steps': sum(1 for step in p.research_steps if step.result is not None)
            } for p in projects.items],
            'total': projects.total,
            'pages': projects.pages,
            'current_page': page
        })
    except Exception as e:
        app.logger.error(f"프로젝트 검색 중 오류 발생: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)