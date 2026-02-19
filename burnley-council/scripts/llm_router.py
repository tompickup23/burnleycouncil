#!/usr/bin/env python3
"""
llm_router.py — Multi-LLM Router for AI DOGE Article Pipeline

Tries multiple free LLM APIs in priority order with automatic failover.
All APIs are free tier / promotional — zero cost.

Priority:
1. Mistral Small (free Experiment tier, ~1B tokens/month, EU-based, GDPR-safe)
2. Cerebras Llama 3.3 70B (1M tokens/day free)
3. Groq Llama 3.3 70B (500K tokens/day free)
4. Ollama local (emergency fallback)

Setup:
    Get free Mistral API key from https://console.mistral.ai
    export MISTRAL_API_KEY="your-key-here"

Usage:
    from llm_router import generate
    text, provider = generate("Write an article", system_prompt="You are a journalist")
"""
import json
import os
import time
import logging

try:
    import requests
except ImportError:
    os.system('pip3 install requests 2>/dev/null')
    import requests

log = logging.getLogger('LLMRouter')

# === PROVIDER CONFIGS ===
# Priority order: Mistral (best free tier) → Cerebras → Groq → Ollama (local fallback)
PROVIDERS = [
    {
        'name': 'mistral-small',
        'base_url': 'https://api.mistral.ai/v1',
        'api_key': os.environ.get('MISTRAL_API_KEY', ''),
        'model': 'mistral-small-latest',
        'temperature': 0.4,  # Lower temp = more factual, less creative
        'max_context': 32768,
        'enabled': True,
    },
    {
        'name': 'cerebras',
        'base_url': 'https://api.cerebras.ai/v1',
        'api_key': os.environ.get('CEREBRAS_API_KEY', ''),
        'model': 'llama-3.3-70b',
        'temperature': 0.5,
        'max_context': 8192,
        'enabled': True,
    },
    {
        'name': 'groq',
        'base_url': 'https://api.groq.com/openai/v1',
        'api_key': os.environ.get('GROQ_API_KEY', ''),
        'model': 'llama-3.3-70b-versatile',
        'temperature': 0.5,
        'max_context': 32768,
        'enabled': True,
    },
    {
        'name': 'ollama-local',
        'base_url': 'http://localhost:11434/v1',
        'api_key': 'ollama',
        'model': 'llama3.1:8b',
        'temperature': 0.5,
        'max_context': 32768,
        'enabled': True,
    },
]


def _call_provider(provider, messages, max_tokens=4000, timeout=180):
    """Call a single LLM provider via OpenAI-compatible API. Returns text or raises."""
    headers = {
        'Authorization': f'Bearer {provider["api_key"]}',
        'Content-Type': 'application/json',
    }
    payload = {
        'model': provider['model'],
        'messages': messages,
        'max_tokens': max_tokens,
        'temperature': provider['temperature'],
    }
    resp = requests.post(
        '{}/chat/completions'.format(provider['base_url']),
        headers=headers, json=payload, timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    msg = data['choices'][0]['message']
    return msg.get('content') or msg.get('reasoning_content', '')


def generate(prompt, system_prompt=None, max_tokens=4000, timeout=180):
    """
    Generate text using the best available free LLM.
    Tries each provider in priority order, fails over on error.
    Returns (text, provider_name) tuple.
    """
    messages = []
    if system_prompt:
        messages.append({'role': 'system', 'content': system_prompt})
    messages.append({'role': 'user', 'content': prompt})

    errors = []
    for provider in PROVIDERS:
        if not provider['enabled'] or not provider['api_key']:
            continue
        try:
            log.info('Trying {}...'.format(provider['name']))
            text = _call_provider(provider, messages, max_tokens, timeout)
            if text and len(text.strip()) > 50:
                log.info('Success via {} ({} chars)'.format(provider['name'], len(text)))
                return text, provider['name']
            else:
                log.warning('{} returned empty/short response ({} chars)'.format(
                    provider['name'], len(text) if text else 0))
        except Exception as e:
            err_msg = str(e)[:200]
            log.warning('{} failed: {}'.format(provider['name'], err_msg))
            errors.append((provider['name'], err_msg))
            time.sleep(1)

    raise RuntimeError('All LLM providers failed: {}'.format(errors))


def generate_simple(prompt, max_tokens=4000):
    """Simple wrapper that just returns text."""
    text, _ = generate(prompt, max_tokens=max_tokens)
    return text


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    text, provider = generate('Say hello and identify yourself in one sentence.')
    print('[{}] {}'.format(provider, text))
