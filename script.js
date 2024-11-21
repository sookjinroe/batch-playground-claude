// 저장된 값 불러오기
document.addEventListener('DOMContentLoaded', () => {
    const savedApiKey = localStorage.getItem('apiKey');
    const savedSystemPrompt = localStorage.getItem('systemPrompt');
    
    if (savedApiKey) document.getElementById('apiKey').value = savedApiKey;
    if (savedSystemPrompt) document.getElementById('systemPrompt').value = savedSystemPrompt;
});

// 설정 저장
function saveSettings() {
    const apiKey = document.getElementById('apiKey').value;
    const systemPrompt = document.getElementById('systemPrompt').value;
    
    localStorage.setItem('apiKey', apiKey);
    localStorage.setItem('systemPrompt', systemPrompt);
}

// CSV 파일 읽기
function readCSV(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const messages = text.split('\n')
                .map(line => line.trim())
                .filter(line => line); // 빈 줄 제거
            resolve(messages);
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// Claude API 호출
async function callClaudeAPI(message, apiKey, systemPrompt, temperature, maxTokens) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-3-opus-20240229',
            max_tokens: maxTokens,
            temperature: temperature,
            system: systemPrompt,
            messages: [{ role: 'user', content: message }]
        })
    });

    return await response.json();
}

// 배치 실행
async function runBatch() {
    const status = document.getElementById('status');
    const apiKey = document.getElementById('apiKey').value;
    const systemPrompt = document.getElementById('systemPrompt').value;
    const temperature = parseFloat(document.getElementById('temperature').value);
    const maxTokens = parseInt(document.getElementById('maxTokens').value);
    const csvFile = document.getElementById('csvFile').files[0];

    if (!apiKey || !csvFile) {
        status.textContent = 'API Key와 CSV 파일을 모두 입력해주세요.';
        return;
    }

    try {
        saveSettings();
        status.textContent = '처리 중...';
        
        const messages = await readCSV(csvFile);
        const results = [];

        for (let i = 0; i < messages.length; i++) {
            status.textContent = `처리 중... (${i + 1}/${messages.length})`;
            
            try {
                const result = await callClaudeAPI(
                    messages[i],
                    apiKey,
                    systemPrompt,
                    temperature,
                    maxTokens
                );
                
                results.push({
                    message: messages[i],
                    response: result.content[0].text,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                results.push({
                    message: messages[i],
                    response: `Error: ${error.message}`,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // CSV 다운로드
        const csv = results.map(r => 
            `${r.timestamp},${JSON.stringify(r.message)},${JSON.stringify(r.response)}`
        ).join('\n');
        
        const blob = new Blob(['Timestamp,Message,Response\n' + csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `batch_results_${new Date().toISOString()}.csv`;
        a.click();

        status.textContent = '완료!';
    } catch (error) {
        status.textContent = `에러 발생: ${error.message}`;
    }
}