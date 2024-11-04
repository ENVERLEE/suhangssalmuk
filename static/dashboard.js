# static/js/dashboard.js
document.addEventListener('DOMContentLoaded', function() {
    // 차트 객체들을 저장할 변수
    let monthlyProjectsChart = null;
    let projectStatusChart = null;
    
    // 현재 페이지 상태
    const state = {
        currentPage: 1,
        searchQuery: '',
        statusFilter: '',
        dateFilter: '',
        itemsPerPage: 10
    };

    // 차트 초기화
    function initializeCharts() {
        // 월별 프로젝트 추이 차트
        const monthlyCtx = document.getElementById('monthlyProjectsChart').getContext('2d');
        monthlyProjectsChart = new Chart(monthlyCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: '프로젝트 수',
                    data: [],
                    borderColor: 'rgb(59, 130, 246)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });

        // 프로젝트 상태 분포 차트
        const statusCtx = document.getElementById('projectStatusChart').getContext('2d');
        projectStatusChart = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: ['완료', '진행 중', '대기 중'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: [
                        'rgb(34, 197, 94)',
                        'rgb(59, 130, 246)',
                        'rgb(209, 213, 219)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    // 대시보드 통계 로드
    async function loadDashboardStats() {
        try {
            const response = await utils.fetchAPI('/api/dashboard/stats');
            if (response.success) {
                updateStatCards(response.stats);
                updateMonthlyChart(response.stats.monthly_projects);
                updateStatusChart(response.stats);
            }
        } catch (error) {
            utils.showError('통계 데이터를 불러오는 중 오류가 발생했습니다.');
        }
    }

    // 통계 카드 업데이트
    function updateStatCards(stats) {
        document.getElementById('totalProjects').textContent = stats.total_projects;
        document.getElementById('completedProjects').textContent = stats.completed_projects;
        document.getElementById('completionRate').textContent = `${stats.completion_rate.toFixed(1)}%`;
        document.getElementById('avgCompletionTime').textContent = stats.avg_completion_days;
    }

    // 월별 차트 업데이트
    function updateMonthlyChart(monthlyData) {
        monthlyProjectsChart.data.labels = monthlyData.map(d => d.month);
        monthlyProjectsChart.data.datasets[0].data = monthlyData.map(d => d.count);
        monthlyProjectsChart.update();
    }

    // 상태 차트 업데이트
    function updateStatusChart(stats) {
        const waiting = stats.total_projects - stats.completed_projects - stats.active_projects;
        projectStatusChart.data.datasets[0].data = [
            stats.completed_projects,
            stats.active_projects,
            waiting
        ];
        projectStatusChart.update();
    }

    // 프로젝트 목록 로드
    async function loadProjects() {
        try {
            const queryParams = new URLSearchParams({
                q: state.searchQuery,
                status: state.statusFilter,
                date: state.dateFilter,
                page: state.currentPage,
                per_page: state.itemsPerPage
            });

            const response = await utils.fetchAPI(`/api/dashboard/search?${queryParams}`);
            if (response.success) {
                updateProjectsList(response.projects);
                updatePagination(response.total, response.pages);
            }
        } catch (error) {
            utils.showError('프로젝트 목록을 불러오는 중 오류가 발생했습니다.');
        }
    }

    // 프로젝트 목록 업데이트
    function updateProjectsList(projects) {
        const tbody = document.getElementById('projectsList');
        tbody.innerHTML = '';

        projects.forEach(project => {
            const progress = (project.completed_steps / project.total_steps * 100) || 0;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <div>
                            <div class="text-sm font-medium text-gray-900">${project.title}</div>
                            <div class="text-sm text-gray-500">ID: ${project.id}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        progress === 100 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                    }">
                        ${progress === 100 ? '완료됨' : '진행 중'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                        <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${progress}%"></div>
                    </div>
                    <span class="text-sm text-gray-600">${progress.toFixed(1)}%</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${new Date(project.created_at).toLocaleString()}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button class="text-indigo-600 hover:text-indigo-900" 
                            onclick="showProjectDetails(${project.id})">
                        상세보기
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    // 페이지네이션 업데이트
    function updatePagination(total, pages) {
        const pagination = document.getElementById('pagination');
        pagination.innerHTML = '';

        // 이전 페이지 버튼
        if (state.currentPage > 1) {
            pagination.appendChild(createPaginationButton('이전', state.currentPage - 1));
        }

        // 페이지 번호들
        for (let i = 1; i <= pages; i++) {
            if (
                i === 1 ||
                i === pages ||
                (i >= state.currentPage - 2 && i <= state.currentPage + 2)
            ) {
                pagination.appendChild(createPaginationButton(i, i));
            } else if (i === state.currentPage - 3 || i === state.currentPage + 3) {
                pagination.appendChild(createPaginationButton('...', null));
            }
        }

        // 다음 페이지 버튼
        if (state.currentPage < pages) {
            pagination.appendChild(createPaginationButton('다음', state.currentPage + 1));
        }

        // 페이지 정보 업데이트
        const start = (state.currentPage - 1) * state.itemsPerPage + 1;
        const end = Math.min(start + state.itemsPerPage - 1, total);
        document.getElementById('totalItems').textContent = total;
        document.getElementById('startItem').textContent = start;
        document.getElementById('endItem').textContent = end;
    }

    // 페이지네이션 버튼 생성
    function createPaginationButton(text, page) {
        const button = document.createElement('button');
        button.className = `relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
            page === state.currentPage
                ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600'
                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
        }`;
        button.textContent = text;

        if (page !== null) {
            button.addEventListener('click', () => {
                state.currentPage = page;
                loadProjects();
            });
        }

        return button;
    }

    // 프로젝트 상세 정보 표시
    async function showProjectDetails(projectId) {
        try {
            const response = await utils.fetchAPI(`/api/project/${projectId}`);
            if (response.success) {
                document.getElementById('modalProjectTitle').textContent = response.project.title;
                document.getElementById('modalContent').innerHTML = `
                    <div class="space-y-4">
                        <div>
                            <h4 class="text-sm font-medium text-gray-500">평가계획서</h4>
                            <p class="mt-1 text-sm text-gray-900">${response.project.evaluation_plan}</p>
                        </div>
                        <div>
                            <h4 class="text-sm font-medium text-gray-500">진행 상황</h4>
                            <div class="mt-2">
                                ${response.project.research_steps.map(step => `
                                    <div class="mb-2">
                                        <div class="flex justify-between items-center">
                                            <span class="text-sm font-medium">${step.description}</span>
                                            <span class="text-sm ${step.result ? 'text-green-600' : 'text-gray-500'}">
                                                ${step.result ? '완료' : '진행 중'}
                                            </span>
                                        </div>
                                        ${step.result ? `
                                            <p class="mt-1 text-sm text-gray-600">${step.result}</p>
                                        ` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
                utils.modal.show('projectModal');
            }
        } catch (error) {
            utils.showError('프로젝트 상세 정보를 불러오는 중 오류가 발생했습니다.');
        }
    }

    // 이벤트 리스너 설정
    function setupEventListeners() {
        // 검색
        const searchInput = document.getElementById('searchInput');
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                state.searchQuery = searchInput.value;
                state.currentPage = 1;
                loadProjects();
            }, 300);
        });

        // 필터
        document.getElementById('statusFilter').addEventListener('change', (e) => {
            state.statusFilter = e.target.value;
            state.currentPage = 1;
            loadProjects();
        });

        document.getElementById('dateFilter').addEventListener('change', (e) => {
            state.dateFilter = e.target.value;
            state.currentPage = 1;
            loadProjects();
        });

        // 모바일 페이지네이션
        document.getElementById('prevPageMobile').addEventListener('click', () => {
            if (state.currentPage > 1) {
                state.currentPage--;
                loadProjects();
            }
        });

        document.getElementById('nextPageMobile').addEventListener('click', () => {
            state.currentPage++;
            loadProjects();
        });

        // 실시간 업데이트
        setInterval(() => {
            loadDashboardStats();
        }, 30000); // 30초마다 업데이트

        // 프로젝트 자동 새로고침
        let autoRefreshInterval;
        const toggleAutoRefresh = document.getElementById('toggleAutoRefresh');
        if (toggleAutoRefresh) {
            toggleAutoRefresh.addEventListener('change', (e) => {
                if (e.target.checked) {
                    autoRefreshInterval = setInterval(loadProjects, 30000);
                } else {
                    clearInterval(autoRefreshInterval);
                }
            });
        }

        // CSV 내보내기
        document.getElementById('exportCSV').addEventListener('click', async () => {
            try {
                const response = await utils.fetchAPI('/api/dashboard/export', {
                    method: 'POST',
                    body: JSON.stringify({
                        query: state.searchQuery,
                        status: state.statusFilter,
                        date: state.dateFilter
                    })
                });

                if (response.success) {
                    const csv = response.data;
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    const url = URL.createObjectURL(blob);
                    link.setAttribute('href', url);
                    link.setAttribute('download', `research_projects_${new Date().toISOString()}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            } catch (error) {
                utils.showError('데이터 내보내기 중 오류가 발생했습니다.');
            }
        });
    }

    // 프로젝트 진행 상황 실시간 업데이트
    function setupProjectProgressUpdates() {
        const source = new EventSource('/api/dashboard/progress-stream');
        
        source.onmessage = function(event) {
            const data = JSON.parse(event.data);
            updateProjectProgress(data);
        };

        source.onerror = function(error) {
            console.error('SSE Error:', error);
            source.close();
        };
    }

    // 개별 프로젝트 진행 상황 업데이트
    function updateProjectProgress(progressData) {
        const projectRow = document.querySelector(`tr[data-project-id="${progressData.project_id}"]`);
        if (projectRow) {
            const progressBar = projectRow.querySelector('.progress-bar');
            const progressText = projectRow.querySelector('.progress-text');
            const statusBadge = projectRow.querySelector('.status-badge');

            if (progressBar && progressText) {
                progressBar.style.width = `${progressData.percentage}%`;
                progressText.textContent = `${progressData.percentage.toFixed(1)}%`;

                if (progressData.percentage === 100) {
                    statusBadge.className = 'status-badge bg-green-100 text-green-800';
                    statusBadge.textContent = '완료됨';
                }
            }
        }
    }

    // 프로젝트 통계 차트 업데이트
    function updateProjectStatistics(stats) {
        const completionTrend = document.getElementById('completionTrend');
        const trendPercentage = ((stats.completed_projects - stats.last_month_completed) / 
                                stats.last_month_completed * 100).toFixed(1);
        
        if (trendPercentage > 0) {
            completionTrend.className = 'text-green-500';
            completionTrend.textContent = `↑ ${trendPercentage}%`;
        } else {
            completionTrend.className = 'text-red-500';
            completionTrend.textContent = `↓ ${Math.abs(trendPercentage)}%`;
        }

        // 기타 통계 업데이트...
    }

    // 대시보드 초기화
    function initializeDashboard() {
        initializeCharts();
        loadDashboardStats();
        loadProjects();
        setupEventListeners();
        setupProjectProgressUpdates();
    }

    // 반응형 차트 크기 조정
    function handleResize() {
        if (monthlyProjectsChart) {
            monthlyProjectsChart.resize();
        }
        if (projectStatusChart) {
            projectStatusChart.resize();
        }
    }

    // 윈도우 크기 변경 이벤트 리스너
    window.addEventListener('resize', handleResize);

    // 대시보드 초기화 실행
    initializeDashboard();
});

// 프로젝트 상세 정보 모달 표시 함수 (전역 스코프)
window.showProjectDetails = async function(projectId) {
    try {
        utils.modal.show('projectModal');
        const modalContent = document.getElementById('modalContent');
        modalContent.innerHTML = '<div class="flex justify-center py-4"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>';

        const response = await utils.fetchAPI(`/api/project/${projectId}`);
        if (response.success) {
            const project = response.data;
            modalContent.innerHTML = `
                <div class="space-y-6">
                    <div>
                        <h4 class="text-lg font-medium text-gray-900">프로젝트 정보</h4>
                        <div class="mt-2 grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-sm font-medium text-gray-500">생성일</p>
                                <p class="mt-1 text-sm text-gray-900">${new Date(project.created_at).toLocaleString()}</p>
                            </div>
                            <div>
                                <p class="text-sm font-medium text-gray-500">진행률</p>
                                <p class="mt-1 text-sm text-gray-900">${project.progress}%</p>
                            </div>
                        </div>
                    </div>
                    <div>
                        <h4 class="text-lg font-medium text-gray-900">연구 단계</h4>
                        <div class="mt-2 space-y-4">
                            ${project.steps.map(step => `
                                <div class="border rounded-lg p-4">
                                    <div class="flex justify-between items-center">
                                        <h5 class="text-sm font-medium text-gray-900">${step.description}</h5>
                                        <span class="px-2 py-1 text-xs rounded-full ${
                                            step.result ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                        }">
                                            ${step.result ? '완료' : '진행 중'}
                                        </span>
                                    </div>
                                    ${step.result ? `
                                        <div class="mt-2">
                                            <p class="text-sm text-gray-600">${step.result}</p>
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        utils.showError('프로젝트 상세 정보를 불러오는 중 오류가 발생했습니다.');
    }
};