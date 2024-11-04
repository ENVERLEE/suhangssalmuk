document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const projectForm = document.getElementById('projectForm');
    const evaluationPlanFile = document.getElementById('evaluationPlanFile');
    const submissionFormatFile = document.getElementById('submissionFormatFile');
    const submitButton = document.getElementById('submitButton');
    const processingStatus = document.getElementById('processingStatus');
    const researchProgress = document.getElementById('researchProgress');
    const stepsContainer = document.getElementById('steps');
    const finalizeButton = document.getElementById('finalizeButton');
    const finalReport = document.getElementById('finalReport');
    const finalReportContent = document.getElementById('finalReportContent');
    const downloadReport = document.getElementById('downloadReport');
    const shareReport = document.getElementById('shareReport');
    
    // State
    let currentProjectId = null;
    let evaluationPlanData = null;
    let submissionFormatData = null;
    let completedSteps = 0;
    let totalSteps = 0;

    // Initialize modal
    utils.modal.init('previewModal');

    // File Upload Handlers
    async function handleFileUpload(file, type) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);

        try {
            const response = await fetch('/api/process-file', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            if (data.success) {
                return {
                    text: data.text,
                    filename: data.filename
                };
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error('File upload error:', error);
            utils.showError(`파일 업로드 중 오류가 발생했습니다: ${error.message}`);
            return null;
        }
    }

    // Preview Handlers
    document.getElementById('previewEvaluationPlan').addEventListener('click', function() {
        if (evaluationPlanData) {
            document.getElementById('modalTitle').textContent = '평가계획서 미리보기';
            document.getElementById('modalContent').textContent = evaluationPlanData.text;
            utils.modal.show('previewModal');
        } else {
            utils.showError('먼저 파일을 업로드해주세요.');
        }
    });

    document.getElementById('previewSubmissionFormat').addEventListener('click', function() {
        if (submissionFormatData) {
            document.getElementById('modalTitle').textContent = '제출양식 미리보기';
            document.getElementById('modalContent').textContent = submissionFormatData.text;
            utils.modal.show('previewModal');
        } else {
            utils.showError('먼저 파일을 업로드해주세요.');
        }
    });

    // File Change Handlers
    evaluationPlanFile.addEventListener('change', async function(e) {
        if (this.files.length > 0) {
            const preview = document.getElementById('evaluationPlanPreview');
            preview.querySelector('p').textContent = '파일 처리 중...';
            preview.classList.remove('hidden');
            
            evaluationPlanData = await handleFileUpload(this.files[0], 'evaluation_plan');
            if (evaluationPlanData) {
                preview.querySelector('p').textContent = `처리 완료: ${this.files[0].name} (${utils.formatFileSize(this.files[0].size)})`;
            } else {
                preview.querySelector('p').textContent = '파일 처리 실패';
            }
        }
    });

    submissionFormatFile.addEventListener('change', async function(e) {
        if (this.files.length > 0) {
            const preview = document.getElementById('submissionFormatPreview');
            preview.querySelector('p').textContent = '파일 처리 중...';
            preview.classList.remove('hidden');
            
            submissionFormatData = await handleFileUpload(this.files[0], 'submission_format');
            if (submissionFormatData) {
                preview.querySelector('p').textContent = `처리 완료: ${this.files[0].name} (${utils.formatFileSize(this.files[0].size)})`;
            } else {
                preview.querySelector('p').textContent = '파일 처리 실패';
            }
        }
    });

    // Form Submit Handler
    projectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!evaluationPlanData || !submissionFormatData) {
            utils.showError('모든 파일을 업로드하고 처리가 완료될 때까지 기다려주세요.');
            return;
        }

        submitButton.disabled = true;
        processingStatus.classList.remove('hidden');

        try {
            const response = await utils.fetchAPI('/api/project', {
                method: 'POST',
                body: JSON.stringify({
                    title: document.getElementById('title').value,
                    evaluation_plan: evaluationPlanData.text,
                    evaluation_plan_file: evaluationPlanData.filename,
                    submission_format: submissionFormatData.text,
                    submission_format_file: submissionFormatData.filename,
                })
            });

            if (response.success) {
                currentProjectId = response.project_id;
                await loadResearchSteps();
                researchProgress.classList.remove('hidden');
                projectForm.reset();
                evaluationPlanData = null;
                submissionFormatData = null;
                document.getElementById('evaluationPlanPreview').classList.add('hidden');
                document.getElementById('submissionFormatPreview').classList.add('hidden');
                utils.showSuccess('프로젝트가 성공적으로 생성되었습니다.');
            }
        } catch (error) {
            utils.showError(`프로젝트 생성 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            submitButton.disabled = false;
            processingStatus.classList.add('hidden');
        }
    });

    // Research Steps Handler
    async function loadResearchSteps() {
        try {
            const response = await utils.fetchAPI(`/api/research/${currentProjectId}/steps`);
            
            if (response.success) {
                stepsContainer.innerHTML = '';
                totalSteps = response.steps.length;
                completedSteps = response.steps.filter(step => step.result).length;
                
                response.steps.forEach((step) => {
                    const stepElement = createStepElement(step);
                    stepsContainer.appendChild(stepElement);
                });
                
                updateProgress();
                finalizeButton.disabled = completedSteps < totalSteps;
            }
        } catch (error) {
            utils.showError('연구 단계 로딩 중 오류가 발생했습니다.');
        }
    }

    function createStepElement(step) {
        const div = document.createElement('div');
        div.className = 'bg-gray-50 p-4 rounded-lg';
        div.innerHTML = `
            <h3 class="font-medium">${step.step_number}. ${step.description}</h3>
            <p class="text-sm text-gray-600 mt-1">방법론: ${step.methodology}</p>
            <p class="text-sm text-gray-600">키워드: ${step.keywords}</p>
            <div class="mt-2" id="step-${step.step_number}-content">
                ${step.result ? `
                    <div class="bg-white p-3 rounded">
                        <p>${step.result}</p>
                    </div>
                ` : `
                    <button class="execute-step bg-blue-500 text-white px-3 py-1 rounded text-sm"
                            data-step="${step.step_number}">
                        실행하기
                    </button>
                `}
            </div>
        `;

        const executeButton = div.querySelector('.execute-step');
        if (executeButton) {
            executeButton.addEventListener('click', () => executeResearchStep(step.step_number));
        }

        return div;
    }

    async function executeResearchStep(stepNumber) {
        const executeButton = document.querySelector(`[data-step="${stepNumber}"]`);
        const contentDiv = document.getElementById(`step-${stepNumber}-content`);
        
        executeButton.disabled = true;
        executeButton.textContent = '실행 중...';
        
        try {
            const response = await utils.fetchAPI(`/api/research/${currentProjectId}/step/${stepNumber}`, {
                method: 'POST'
            });

            if (response.success) {
                contentDiv.innerHTML = `
                    <div class="bg-white p-3 rounded">
                        <p>${response.result}</p>
                    </div>
                `;
                completedSteps++;
                updateProgress();
                finalizeButton.disabled = completedSteps < totalSteps;
                utils.showSuccess('연구 단계가 성공적으로 완료되었습니다.');
            }
        } catch (error) {
            utils.showError(`연구 단계 실행 중 오류가 발생했습니다: ${error.message}`);
            executeButton.disabled = false;
            executeButton.textContent = '실행하기';
        }
    }
    function updateProgress() {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const percentage = Math.round((completedSteps / totalSteps) * 100);
        utils.updateProgress(progressBar, progressText, percentage);
    }

    // Finalize Handler
    finalizeButton.addEventListener('click', async () => {
        if (completedSteps < totalSteps) {
            utils.showError('모든 연구 단계를 완료한 후 최종 보고서를 생성할 수 있습니다.');
            return;
        }

        finalizeButton.disabled = true;
        finalizeButton.textContent = '생성 중...';
        
        try {
            const response = await utils.fetchAPI(`/api/research/${currentProjectId}/finalize`, {
                method: 'POST'
            });
            
            if (response.success) {
                finalReportContent.innerHTML = response.final_report;
                finalReport.classList.remove('hidden');
                utils.showSuccess('최종 보고서가 성공적으로 생성되었습니다.');
            }
        } catch (error) {
            utils.showError(`최종 보고서 생성 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            finalizeButton.disabled = false;
            finalizeButton.textContent = '최종 보고서 생성';
        }
    });

    // Download Report Handler
    downloadReport.addEventListener('click', () => {
        const reportText = finalReportContent.innerText;
        utils.downloadFile(
            reportText, 
            `research_report_${currentProjectId}_${new Date().toISOString().slice(0,10)}.txt`
        );
    });

    // Share Report Handler
    shareReport.addEventListener('click', async () => {
        try {
            const reportText = finalReportContent.innerText;
            
            if (navigator.share) {
                await navigator.share({
                    title: '연구 보고서',
                    text: reportText,
                    url: window.location.href
                });
            } else {
                // 클립보드에 복사
                await navigator.clipboard.writeText(reportText);
                utils.showSuccess('보고서 내용이 클립보드에 복사되었습니다.');
            }
        } catch (error) {
            utils.showError('보고서 공유 중 오류가 발생했습니다.');
        }
    });

    // Error Handler
    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled promise rejection:', event.reason);
        utils.showError('예기치 않은 오류가 발생했습니다. 페이지를 새로고침하고 다시 시도해주세요.');
    });

    // 자동 저장 기능
    let autoSaveInterval;
    
    function startAutoSave() {
        if (currentProjectId) {
            autoSaveInterval = setInterval(async () => {
                try {
                    await utils.fetchAPI(`/api/project/${currentProjectId}/autosave`, {
                        method: 'POST',
                        body: JSON.stringify({
                            completed_steps: completedSteps,
                            total_steps: totalSteps
                        })
                    });
                } catch (error) {
                    console.error('자동 저장 중 오류:', error);
                }
            }, 60000); // 1분마다 자동 저장
        }
    }

    function stopAutoSave() {
        if (autoSaveInterval) {
            clearInterval(autoSaveInterval);
        }
    }

    // 페이지 이탈 감지
    window.addEventListener('beforeunload', (e) => {
        if (currentProjectId && completedSteps > 0 && completedSteps < totalSteps) {
            e.preventDefault();
            e.returnValue = '진행 중인 연구가 있습니다. 정말로 나가시겠습니까?';
        }
    });

    // 프로그레스 바 애니메이션
    function animateProgress(element, start, end, duration) {
        const startTimestamp = performance.now();
        
        function update(currentTimestamp) {
            const elapsed = currentTimestamp - startTimestamp;
            const progress = Math.min(elapsed / duration, 1);
            
            const current = start + (end - start) * progress;
            element.style.width = `${current}%`;
            
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }
        
        requestAnimationFrame(update);
    }

    // 파일 크기 검증
    function validateFileSize(file, maxSize = 16 * 1024 * 1024) { // 16MB
        if (file.size > maxSize) {
            utils.showError(`파일 크기가 너무 큽니다. 최대 ${utils.formatFileSize(maxSize)}까지 허용됩니다.`);
            return false;
        }
        return true;
    }

    // 파일 타입 검증
    function validateFileType(file) {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
        if (!allowedTypes.includes(file.type)) {
            utils.showError('허용되지 않는 파일 형식입니다. PDF, JPG, PNG 파일만 업로드 가능합니다.');
            return false;
        }
        return true;
    }

    // 입력 필드 검증
    projectForm.querySelectorAll('input, textarea').forEach(input => {
        input.addEventListener('invalid', (e) => {
            e.preventDefault();
            utils.showError(`${input.getAttribute('data-name') || input.name}: ${input.validationMessage}`);
        });
    });

    // 초기화
    function init() {
        const savedProjectId = localStorage.getItem('currentProjectId');
        if (savedProjectId) {
            currentProjectId = savedProjectId;
            loadResearchSteps();
        }
    }

    init();
});