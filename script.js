// 템플릿 관리를 위한 클래스
class TemplateManager {
    constructor() {
        this.templates = this.loadTemplates();
        this.setupTemplateControls();
    }

    loadTemplates() {
        return JSON.parse(localStorage.getItem('systemMessageTemplates') || '{}');
    }

    saveTemplate(name, content) {
        this.templates[name] = content;
        localStorage.setItem('systemMessageTemplates', JSON.stringify(this.templates));
        this.updateTemplateSelect();
    }

    deleteTemplate(name) {
        delete this.templates[name];
        localStorage.setItem('systemMessageTemplates', JSON.stringify(this.templates));
        this.updateTemplateSelect();
    }

    updateTemplateSelect() {
        const select = document.querySelector('.template-controls select');
        select.innerHTML = '<option value="">템플릿 선택...</option>';
        Object.keys(this.templates).forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
    }

    setupTemplateControls() {
        // 템플릿 선택 이벤트
        const select = document.querySelector('.template-controls select');
        select.addEventListener('change', (e) => {
            if (e.target.value) {
                document.querySelector('textarea[name="systemMessage"]').value = 
                    this.templates[e.target.value];
            }
        });

        // 현재 메시지 저장 버튼 이벤트
        const saveBtn = document.querySelector('.template-controls button:nth-child(2)');
        const modal = document.getElementById('template-modal');
        saveBtn.addEventListener('click', () => {
            const currentMessage = document.querySelector('textarea[name="systemMessage"]').value;
            document.getElementById('template-content-preview').textContent = currentMessage;
            modal.style.display = 'block';
        });

        // 템플릿 삭제 버튼 이벤트
        const deleteBtn = document.querySelector('.template-controls button:nth-child(3)');
        deleteBtn.addEventListener('click', () => {
            const selectedTemplate = select.value;
            if (selectedTemplate && confirm('선택한 템플릿을 삭제하시겠습니까?')) {
                this.deleteTemplate(selectedTemplate);
            }
        });

        // 모달 저장 버튼 이벤트
        const modalSaveBtn = modal.querySelector('.modal-buttons button:nth-child(1)');
        modalSaveBtn.addEventListener('click', () => {
            const name = modal.querySelector('input[type="text"]').value;
            const content = document.querySelector('textarea[name="systemMessage"]').value;
            if (name) {
                this.saveTemplate(name, content);
                modal.style.display = 'none';
                modal.querySelector('input[type="text"]').value = '';
            }
        });

        // 모달 취소 버튼 이벤트
        const modalCancelBtn = modal.querySelector('.modal-buttons button:nth-child(2)');
        modalCancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            modal.querySelector('input[type="text"]').value = '';
        });

        this.updateTemplateSelect();
    }
}

// API 호출 처리를 위한 클래스
class AnthropicBatchProcessor {
    constructor() {
        this.setupEventListeners();
        this.templateManager = new TemplateManager();
        this.isProcessing = false;
    }

    setupEventListeners() {
        const form = document.querySelector('form');
        form.addEventListener('submit', this.handleSubmit.bind(this));
    }

    async handleSubmit(e) {
        e.preventDefault();
        if (this.isProcessing) return;

        const apiKey = document.querySelector('input[name="apiKey"]').value;
        const model = document.querySelector('select[name="model"]').value;
        const temperature = parseFloat(document.querySelector('input[name="temperature"]').value);
        const maxTokens = parseInt(document.querySelector('input[name="maxTokens"]').value);
        const systemMessage = document.querySelector('textarea[name="systemMessage"]').value;
        const fileInput = document.querySelector('input[type="file"]');

        if (!this.validateInputs(apiKey, model, temperature, maxTokens, fileInput)) {
            return;
        }

        try {
            this.isProcessing = true;
            this.updateStatus('파일 처리 중...');
            const data = await this.processFile(fileInput.files[0]);
            await this.processBatch(data, {
                apiKey,
                model,
                temperature,
                maxTokens,
                systemMessage
            });
        } catch (error) {
            this.updateStatus(`에러 발생: ${error.message}`, true);
        } finally {
            this.isProcessing = false;
        }
    }

    validateInputs(apiKey, model, temperature, maxTokens, fileInput) {
        if (!apiKey || !apiKey.startsWith('sk-ant-')) {
            this.updateStatus('유효한 Anthropic API 키를 입력해주세요.', true);
            return false;
        }
        if (!model) {
            this.updateStatus('모델을 선택해주세요.', true);
            return false;
        }
        if (isNaN(temperature) || temperature < 0 || temperature > 1) {
            this.updateStatus('Temperature는 0과 1 사이의 값이어야 합니다.', true);
            return false;
        }
        if (isNaN(maxTokens) || maxTokens < 1) {
            this.updateStatus('유효한 Max Tokens 값을 입력해주세요.', true);
            return false;
        }
        if (!fileInput.files[0]) {
            this.updateStatus('처리할 파일을 선택해주세요.', true);
            return false;
        }
        return true;
    }

    async processFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { 
                        type: 'array',
                        codepage: 949    // 한글 Windows 경우
                    });
                    
                    // 첫 번째 시트 사용
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);

                    // id와 user 컬럼 확인
                    if (!jsonData.length || !jsonData[0].hasOwnProperty('id') || !jsonData[0].hasOwnProperty('user')) {
                        throw new Error('엑셀 파일은 반드시 "id"와 "user" 열을 포함해야 합니다.');
                    }

                    const processedData = jsonData.map(row => ({
                        id: row.id.toString(),
                        user: row.user.toString()
                    }));

                    resolve(processedData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('파일 읽기 실패'));
            reader.readAsArrayBuffer(file);
        });
    }

    async processBatch(data, config) {
        const statusSection = document.getElementById('status-section');
        statusSection.style.display = 'block';
        this.updateStatus('배치 요청 준비 중...');

        // 배치 요청 준비
        const requests = data.map(item => ({
            custom_id: item.id,
            params: {
                model: config.model,
                max_tokens: config.maxTokens,
                messages: [
                    {
                        role: 'user',
                        content: item.user
                    }
                ],
                system: config.systemMessage,
                temperature: config.temperature
            }
        }));

        try {
            const results = await this.callAnthropicBatchAPI(requests, config.apiKey);
            this.downloadResults(results);
            this.updateStatus('처리 완료. 결과 파일이 다운로드됩니다.');
        } catch (error) {
            this.updateStatus(`배치 처리 중 오류 발생: ${error.message}`, true);
            throw error;
        }
    }

    async callAnthropicBatchAPI(requests, apiKey) {
        const response = await fetch('https://api.anthropic.com/v1/messages/batches', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({ requests })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || '배치 API 호출 실패');
        }

        const batchResponse = await response.json();
        
        // 배치 응답 처리
        return batchResponse.requests.map(request => ({
            id: request.custom_id,
            user: requests.find(r => r.custom_id === request.custom_id).params.messages[0].content,
            response: request.status === 'completed' 
                ? request.result.content[0].text 
                : `Error: ${request.error?.message || 'Unknown error'}`,
            status: request.status
        }));
    }

    convertToCSV(results) {
        const headers = ['id', 'user', 'response', 'status'];
        
        // 안전한 CSV 문자열 변환 함수
        const escapeCsvValue = (value) => {
            if (value === null || value === undefined) {
                return '';
            }
            
            const stringValue = String(value);
            
            // 쉼표, 큰따옴표, 개행문자가 포함된 경우 처리
            if (/[",\n\r]/.test(stringValue)) {
                // 큰따옴표를 두 번 반복하여 이스케이프
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            
            return stringValue;
        };

        const rows = results.map(result => {
            return headers.map(header => 
                escapeCsvValue(result[header])
            ).join(',');
        });

        return [headers.join(','), ...rows].join('\n');
    }

    downloadResults(results) {
        // UTF-8 BOM 추가
        const BOM = '\uFEFF';
        const csv = BOM + this.convertToCSV(results);
        
        // UTF-8 인코딩 명시적 지정
        const blob = new Blob([csv], { 
            type: 'text/csv;charset=utf-8;'
        });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        
        // 파일명에 타임스탬프 추가 (한국 시간 기준)
        const timestamp = new Date().toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).replace(/[/:]/g, '').replace(/, /g, '_');
        
        link.download = `batch_results_${timestamp}.csv`;
        link.click();
    }

    updateStatus(message, isError = false) {
        const statusMessage = document.getElementById('status-message');
        statusMessage.textContent = message;
        statusMessage.style.borderLeftColor = isError ? '#dc3545' : '#4CAF50';
    }
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    new AnthropicBatchProcessor();
});