const STORAGE_KEYS = {
    API_KEY: 'openai_batch_api_key',
    MODEL: 'openai_batch_model',
    TEMPERATURE: 'openai_batch_temperature',
    MAX_TOKENS: 'openai_batch_max_tokens',
    TEMPLATES: 'openai_batch_templates',
};

// DOM 요소
const elements = {
    apiKey: document.getElementById('api-key'),
    model: document.getElementById('model'),
    temperature: document.getElementById('temperature'),
    maxTokens: document.getElementById('max-tokens'),
    systemMessage: document.getElementById('system-message'),
    inputCsv: document.getElementById('input-csv'),
    downloadBtn: document.getElementById('download-btn'),
    templateSelect: document.getElementById('template-select'),
    saveTemplateBtn: document.getElementById('save-template'),
    deleteTemplateBtn: document.getElementById('delete-template'),
    templateModal: document.getElementById('template-modal'),
    templateName: document.getElementById('template-name'),
    templatePreview: document.getElementById('template-content-preview'),
    saveTemplateConfirm: document.getElementById('save-template-confirm'),
    cancelTemplateSave: document.getElementById('cancel-template-save'),
};

// 설정 저장 함수
function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.API_KEY, elements.apiKey.value);
    localStorage.setItem(STORAGE_KEYS.MODEL, elements.model.value);
    localStorage.setItem(STORAGE_KEYS.TEMPERATURE, elements.temperature.value);
    localStorage.setItem(STORAGE_KEYS.MAX_TOKENS, elements.maxTokens.value);
}

// 설정 불러오기 함수
function loadSettings() {
    elements.apiKey.value = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    elements.model.value = localStorage.getItem(STORAGE_KEYS.MODEL) || 'gpt-3.5-turbo-0125';
    elements.temperature.value = localStorage.getItem(STORAGE_KEYS.TEMPERATURE) || '0.7';
    elements.maxTokens.value = localStorage.getItem(STORAGE_KEYS.MAX_TOKENS) || '1000';
    
    loadTemplates();
}

// 템플릿 관리 함수들
function loadTemplates() {
    const templates = JSON.parse(localStorage.getItem(STORAGE_KEYS.TEMPLATES) || '[]');
    elements.templateSelect.innerHTML = '<option value="">템플릿 선택...</option>';
    templates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.name;
        option.textContent = template.name;
        elements.templateSelect.appendChild(option);
    });
}

function saveTemplate(name, content) {
    const templates = JSON.parse(localStorage.getItem(STORAGE_KEYS.TEMPLATES) || '[]');
    const existingIndex = templates.findIndex(t => t.name === name);
    
    if (existingIndex >= 0) {
        templates[existingIndex].content = content;
    } else {
        templates.push({ name, content });
    }
    
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
    loadTemplates();
}

function deleteTemplate(name) {
    const templates = JSON.parse(localStorage.getItem(STORAGE_KEYS.TEMPLATES) || '[]');
    const newTemplates = templates.filter(t => t.name !== name);
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(newTemplates));
    loadTemplates();
}

// 이벤트 리스너
function setupEventListeners() {
    // 설정 저장
    elements.apiKey.addEventListener('change', saveSettings);
    elements.model.addEventListener('change', saveSettings);
    elements.temperature.addEventListener('change', saveSettings);
    elements.maxTokens.addEventListener('change', saveSettings);
    
    // 템플릿 선택
    elements.templateSelect.addEventListener('change', (e) => {
        if (!e.target.value) return;
        
        const templates = JSON.parse(localStorage.getItem(STORAGE_KEYS.TEMPLATES) || '[]');
        const selected = templates.find(t => t.name === e.target.value);
        if (selected) {
            elements.systemMessage.value = selected.content;
        }
    });
    
    // 템플릿 저장 버튼
    elements.saveTemplateBtn.addEventListener('click', () => {
        if (!elements.systemMessage.value.trim()) {
            alert('시스템 메시지를 입력해주세요.');
            return;
        }
        
        elements.templatePreview.textContent = elements.systemMessage.value;
        elements.templateModal.style.display = 'block';
    });
    
    // 템플릿 저장 확인
    elements.saveTemplateConfirm.addEventListener('click', () => {
        const name = elements.templateName.value.trim();
        if (!name) {
            alert('템플릿 이름을 입력해주세요.');
            return;
        }
        
        saveTemplate(name, elements.systemMessage.value);
        elements.templateModal.style.display = 'none';
        elements.templateName.value = '';
    });
    
    // 템플릿 삭제
    elements.deleteTemplateBtn.addEventListener('click', () => {
        const selectedTemplate = elements.templateSelect.value;
        if (!selectedTemplate) {
            alert('삭제할 템플릿을 선택해주세요.');
            return;
        }
        
        if (confirm(`"${selectedTemplate}" 템플릿을 삭제하시겠습니까?`)) {
            deleteTemplate(selectedTemplate);
            elements.systemMessage.value = '';
            elements.templateSelect.value = '';
        }
    });
    
    // 모달 닫기
    elements.cancelTemplateSave.addEventListener('click', () => {
        elements.templateModal.style.display = 'none';
        elements.templateName.value = '';
    });
}

// 전역 변수로 입력 데이터 저장
let inputContents = [];
let outputMap = new Map();  // 추가
let originalFileName = '';

// DOM 요소 참조
const inputCsvFile = document.getElementById('input-csv');
const downloadBtn = document.getElementById('download-btn');
const apiKey = document.getElementById('api-key');

// 파일 입력 이벤트 리스너
inputCsvFile.addEventListener('change', handleInputCSV);
downloadBtn.addEventListener('click', startBatchProcess);

// CSV 파일 읽기
async function handleInputCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    originalFileName = file.name.replace(/\.[^/.]+$/, '');
    downloadBtn.disabled = true;

    try {
        // Excel과 CSV 모두 동일한 형태의 데이터로 변환
        inputContents = file.name.match(/\.(xlsx|xls)$/i) 
            ? await readExcelFile(file)
            : await readFileAsText(file);

        // 데이터 검증
        if (!inputContents || !inputContents.length) {
            throw new Error('파일이 비어있습니다.');
        }

        downloadBtn.disabled = false;
    } catch (error) {
        alert('파일 읽기 실패: ' + error.message);
        downloadBtn.disabled = true;
        inputContents = [];
    }
}

// Batch 처리 시작
async function startBatchProcess() {
    if (!inputContents.length || !apiKey.value) {
        alert('CSV 파일과 API Key가 필요합니다.');
        return;
    }

    try {
        const requests = createBatchJSONL();
        downloadBtn.disabled = true;

        const response = await fetch('https://api.anthropic.com/v1/messages/batches', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey.value,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({ requests })
        });

        if (!response.ok) {
            throw new Error('배치 처리 실패');
        }

        const results = await response.json();
        processBatchResults(results);
        
    } catch (error) {
        alert('배치 처리 실패: ' + error.message);
    }
}

// JSONL 파일 내용 생성
function createBatchJSONL() {
    const requests = inputContents.map((content, index) => ({
        custom_id: content.id,  // request-${index + 1} 대신 실제 id 사용
        params: {
            model: document.getElementById('model').value,
            max_tokens: parseInt(document.getElementById('max-tokens').value) || 1000,
            messages: [
                {
                    role: "system",
                    content: document.getElementById('system-message').value
                },
                {
                    role: "user",
                    content: content.user || ''
                }
            ]
        }
    }));

    return requests;  // JSONL 문자열이 아닌 객체 배열 반환
}

// 배치 결과 처리 및 CSV 다운로드
async function processBatchResults(batchResponse) {
    try {
        console.log('Batch response:', batchResponse);
        const results = batchResponse.requests;  // OpenAI와 다른 응답 구조

        results.forEach(result => {
            // Anthropic 응답 구조에 맞게 수정
            const messageContent = result.status === 'completed'
                ? result.result.content[0].text
                : `Error: ${result.error?.message || 'Unknown error'}`;
            outputMap.set(result.custom_id, messageContent);  // custom_id가 실제 id로 변경됨
        });

        // 나머지 코드는 동일
        const csvContent = [
            'id,user,assistant',
            ...inputContents.map((input) => {
                const output = outputMap.get(input.id) || '';
                return `"${escapeCsvField(input.id)}","${escapeCsvField(input.user)}","${escapeCsvField(output)}"`;
            })
        ].join('\n');

        if (originalFileName.match(/\.(xlsx|xls)$/i)) {
            downloadExcel(inputContents.map(input => ({
                id: input.id,
                user: input.user,
                assistant: outputMap.get(input.id) || ''
            })));
        } else {
            downloadCsv(csvContent);
        }
        
        downloadBtn.disabled = false;
    } catch (error) {
        alert('결과 처리 실패: ' + error.message);
        console.error('Full error:', error);
    }
}

function downloadExcel(data) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${originalFileName}_results_${timestamp}.xlsx`;
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, filename);
}

function downloadCsv(content) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${originalFileName}_results_${timestamp}.csv`;
    
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 유틸리티 함수들
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const text = reader.result;
                const rows = parseCSV(text);  // 새로운 CSV 파서 사용
                
                if (rows.length < 2) throw new Error('파일이 비어있습니다.');
                
                // 헤더 확인 (첫 번째 행)
                const headers = rows[0];
                const idIndex = headers.findIndex(h => h.trim().toLowerCase() === 'id');
                const userIndex = headers.findIndex(h => h.trim().toLowerCase() === 'user');
                
                if (idIndex === -1 || userIndex === -1) {
                    throw new Error('파일은 반드시 "id"와 "user" 열을 포함해야 합니다.');
                }
                
                // 데이터 파싱 (두 번째 행부터)
                const data = rows.slice(1)
                    .filter(row => row.length > 0)
                    .map(row => ({
                        id: row[idIndex]?.trim() || '',
                        user: row[userIndex]?.trim() || ''
                    }));
                
                resolve(data);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file, 'UTF-8');
    });
}

function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                
                // 헤더 확인
                if (!jsonData.length || !jsonData[0].hasOwnProperty('id') || !jsonData[0].hasOwnProperty('user')) {
                    throw new Error('파일은 반드시 "id"와 "user" 열을 포함해야 합니다.');
                }
                
                // id와 user 컬럼만 추출
                resolve(jsonData.map(row => ({
                    id: row.id?.toString() || '',
                    user: row.user?.toString() || ''
                })));
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

function escapeCsvField(field) {
    if (field === null || field === undefined) return '';
    return field.toString()
        .replace(/"/g, '""')  // 큰따옴표 이스케이프
        .replace(/\n/g, ' ')  // 줄바꿈 제거
        .replace(/\r/g, '');  // 캐리지 리턴 제거
}

// CSV 파싱 함수 추가
function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let withinQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        
        if (char === '"') {
            if (withinQuotes && nextChar === '"') {
                // 두 개의 연속된 따옴표는 하나의 따옴표로 처리
                currentField += '"';
                i++;
            } else {
                // 따옴표 상태 전환
                withinQuotes = !withinQuotes;
            }
        } else if (char === ',' && !withinQuotes) {
            // 필드 구분
            currentRow.push(currentField);
            currentField = '';
        } else if ((char === '\n' || char === '\r') && !withinQuotes) {
            // 행 구분
            if (char === '\r' && nextChar === '\n') {
                i++; // \r\n 건너뛰기
            }
            if (currentField || currentRow.length > 0) {
                currentRow.push(currentField);
                rows.push(currentRow);
                currentRow = [];
                currentField = '';
            }
        } else {
            currentField += char;
        }
    }
    
    // 마지막 필드/행 처리
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    
    return rows;
}

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    setupEventListeners();
});