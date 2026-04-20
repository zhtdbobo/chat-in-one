import requests

API_KEY = 'your_api_key_here'  # 替换为你的实际 API Key
API_URL = 'https://www.finna.com.cn/v1/chat/completions'

def test_fetch():
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {API_KEY}'
    }

    payload = {
        "model": "qwen-plus",
        "temperature": 0.7,
        "stream": False,
        "messages": [
            {"role": "system", "content": "使用中文回答用户问题。"},
            {"role": "user", "content": "你好"}
        ]
    }

    try:
        response = requests.post(API_URL, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        print("Response:", data)
    except requests.exceptions.RequestException as e:
        print("Error:", e)

if __name__ == "__main__":
    test_fetch()