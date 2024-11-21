async function testAPI() {
    const status = document.getElementById('status');
    const result = document.getElementById('result');
    const apiKey = document.getElementById('apiKey').value;
    const message = document.getElementById('message').value;

    if (!apiKey || !message) {
        status.textContent = 'API Key와 메시지를 입력해주세요.';
        return;
    }

    try {
        status.textContent = '호출 중...';
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2024-01-01'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20241022',
                max_tokens: 1000,
                temperature: 0.7,
                messages: [{ role: 'user', content: message }]
            })
        });

        const data = await response.json();
        result.textContent = JSON.stringify(data, null, 2);
        status.textContent = '완료!';
        
    } catch (error) {
        status.textContent = `에러 발생: ${error.message}`;
        result.textContent = '';
    }
}