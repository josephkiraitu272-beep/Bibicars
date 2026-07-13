#!/usr/bin/env python3
"""
Test OpenAI Usage Aggregation Logic
====================================
Inserts 2 synthetic usage rows and verifies aggregation math.
"""

import sys
import requests
from datetime import datetime
from pymongo import MongoClient

BASE_URL = "https://embergate-preview-9.preview.emergentagent.com"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "bibi_cars"

def login_admin():
    """Login as admin and get token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@bibi.cars", "password": "Admin123!Bibi"}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get('access_token') or data.get('token')
    return None

def get_usage(token):
    """Get usage data from API"""
    response = requests.get(
        f"{BASE_URL}/api/admin/integrations/openai/usage",
        headers={"Authorization": f"Bearer {token}"}
    )
    if response.status_code == 200:
        return response.json()
    return None

def main():
    print("="*60)
    print("AGGREGATION TESTING - OpenAI Usage")
    print("="*60)
    
    # Connect to MongoDB
    print("\n[1] Connecting to MongoDB...")
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Login
    print("\n[2] Logging in as admin...")
    token = login_admin()
    if not token:
        print("❌ Login failed")
        return 1
    print(f"✅ Got token: {token[:20]}...")
    
    # Get baseline usage
    print("\n[3] Getting baseline usage...")
    baseline = get_usage(token)
    if not baseline:
        print("❌ Failed to get baseline usage")
        return 1
    
    baseline_requests = baseline.get('today', {}).get('requests', 0)
    baseline_cost = baseline.get('today', {}).get('cost_usd', 0)
    baseline_tokens_in = baseline.get('today', {}).get('tokens_in', 0)
    baseline_tokens_out = baseline.get('today', {}).get('tokens_out', 0)
    baseline_audio = baseline.get('today', {}).get('audio_seconds', 0)
    
    print(f"   Baseline today.requests: {baseline_requests}")
    print(f"   Baseline today.cost_usd: ${baseline_cost}")
    print(f"   Baseline today.tokens_in: {baseline_tokens_in}")
    print(f"   Baseline today.tokens_out: {baseline_tokens_out}")
    print(f"   Baseline today.audio_seconds: {baseline_audio}")
    
    # Insert synthetic usage rows
    print("\n[4] Inserting 2 synthetic usage rows...")
    
    synthetic_rows = [
        {
            '_id': 'agent-test-1',
            'ts': datetime.utcnow(),
            'kind': 'chat',
            'endpoint': 'chat.completions',
            'model': 'gpt-4o',
            'prompt_tokens': 1200,
            'completion_tokens': 450,
            'total_tokens': 1650,
            'cost_usd': 0.0075,
            'pricing_source': 'table:v1'
        },
        {
            '_id': 'agent-test-2',
            'ts': datetime.utcnow(),
            'kind': 'transcribe',
            'endpoint': 'audio.transcriptions',
            'model': 'gpt-4o-transcribe',
            'audio_seconds': 180,
            'cost_usd': 0.018,
            'pricing_source': 'table:v1'
        }
    ]
    
    try:
        db.openai_usage.insert_many(synthetic_rows)
        print("✅ Inserted 2 synthetic rows")
    except Exception as e:
        print(f"❌ Failed to insert: {e}")
        return 1
    
    # Get updated usage
    print("\n[5] Getting updated usage...")
    updated = get_usage(token)
    if not updated:
        print("❌ Failed to get updated usage")
        return 1
    
    today = updated.get('today', {})
    by_model = updated.get('by_model', [])
    
    print(f"   Updated today.requests: {today.get('requests', 0)}")
    print(f"   Updated today.cost_usd: ${today.get('cost_usd', 0)}")
    print(f"   Updated today.tokens_in: {today.get('tokens_in', 0)}")
    print(f"   Updated today.tokens_out: {today.get('tokens_out', 0)}")
    print(f"   Updated today.audio_seconds: {today.get('audio_seconds', 0)}")
    
    # Verify aggregation math
    print("\n[6] Verifying aggregation math...")
    
    expected_requests = baseline_requests + 2
    expected_cost = round(baseline_cost + 0.0075 + 0.018, 4)
    expected_tokens_in = baseline_tokens_in + 1200
    expected_tokens_out = baseline_tokens_out + 450
    expected_audio = round(baseline_audio + 180, 2)
    
    actual_requests = today.get('requests', 0)
    actual_cost = today.get('cost_usd', 0)
    actual_tokens_in = today.get('tokens_in', 0)
    actual_tokens_out = today.get('tokens_out', 0)
    actual_audio = today.get('audio_seconds', 0)
    
    tests_passed = 0
    tests_failed = 0
    
    # Check requests
    if actual_requests == expected_requests:
        print(f"✅ today.requests: {actual_requests} == {expected_requests}")
        tests_passed += 1
    else:
        print(f"❌ today.requests: {actual_requests} != {expected_requests}")
        tests_failed += 1
    
    # Check cost (allow small floating point difference)
    if abs(actual_cost - expected_cost) < 0.0001:
        print(f"✅ today.cost_usd: ${actual_cost} ≈ ${expected_cost}")
        tests_passed += 1
    else:
        print(f"❌ today.cost_usd: ${actual_cost} != ${expected_cost}")
        tests_failed += 1
    
    # Check tokens_in
    if actual_tokens_in == expected_tokens_in:
        print(f"✅ today.tokens_in: {actual_tokens_in} == {expected_tokens_in}")
        tests_passed += 1
    else:
        print(f"❌ today.tokens_in: {actual_tokens_in} != {expected_tokens_in}")
        tests_failed += 1
    
    # Check tokens_out
    if actual_tokens_out == expected_tokens_out:
        print(f"✅ today.tokens_out: {actual_tokens_out} == {expected_tokens_out}")
        tests_passed += 1
    else:
        print(f"❌ today.tokens_out: {actual_tokens_out} != {expected_tokens_out}")
        tests_failed += 1
    
    # Check audio_seconds
    if abs(actual_audio - expected_audio) < 0.01:
        print(f"✅ today.audio_seconds: {actual_audio} ≈ {expected_audio}")
        tests_passed += 1
    else:
        print(f"❌ today.audio_seconds: {actual_audio} != {expected_audio}")
        tests_failed += 1
    
    # Check by_model breakdown
    print("\n[7] Checking by_model breakdown...")
    gpt4o_found = False
    gpt4o_transcribe_found = False
    
    for model in by_model:
        if model.get('model') == 'gpt-4o':
            gpt4o_found = True
            print(f"   ✅ Found gpt-4o: {model.get('requests')} req, ${model.get('cost_usd')}")
        elif model.get('model') == 'gpt-4o-transcribe':
            gpt4o_transcribe_found = True
            print(f"   ✅ Found gpt-4o-transcribe: {model.get('requests')} req, ${model.get('cost_usd')}")
    
    if gpt4o_found and gpt4o_transcribe_found:
        print("✅ Both models present in by_model breakdown")
        tests_passed += 1
    else:
        print(f"❌ Missing models in by_model: gpt-4o={gpt4o_found}, gpt-4o-transcribe={gpt4o_transcribe_found}")
        tests_failed += 1
    
    # Cleanup
    print("\n[8] Cleaning up synthetic rows...")
    result = db.openai_usage.delete_many({'_id': {'$in': ['agent-test-1', 'agent-test-2']}})
    print(f"✅ Deleted {result.deleted_count} rows")
    
    # Summary
    print("\n" + "="*60)
    print("AGGREGATION TEST SUMMARY")
    print("="*60)
    print(f"Tests passed: {tests_passed}")
    print(f"Tests failed: {tests_failed}")
    
    return 0 if tests_failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
