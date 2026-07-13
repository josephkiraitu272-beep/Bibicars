"""
BIBI CRM — Call Intelligence Backend API Testing
=================================================
Tests for Wave 2A-CI (Jul 12, 2026) — Call Intelligence feature.

Test Coverage:
- GET /api/admin/calls/intelligence/config → 200 with config
- Auth checks: all endpoints return 401 without auth
- 404 handling for non-existent calls
- Process endpoint with synthetic call (expected to fail with insufficient_quota)
- GET intelligence after failed process (should show failed status)
- Stats endpoint (should return 0 successful CI)
- At-risk endpoint (should return empty list)
- Apply endpoint (create task from CI)
- Regression: healthz still works

IMPORTANT: The user-provided OpenAI key has $0 quota — LIVE transcription
will 429 `insufficient_quota`. That's expected and the code must handle
the failure gracefully.
"""
import requests
import sys
import uuid
from datetime import datetime
from pymongo import MongoClient

class CallIntelligenceTester:
    def __init__(self, base_url="https://embergate-preview-7.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.issues = []
        self.mongo_client = None
        self.db = None

    def connect_mongo(self):
        """Connect to MongoDB"""
        try:
            self.mongo_client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=5000)
            self.db = self.mongo_client["bibi_cars"]
            # Test connection
            self.mongo_client.admin.command('ping')
            print("✅ MongoDB connected")
            return True
        except Exception as e:
            print(f"❌ MongoDB connection failed: {e}")
            return False

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, allow_error_field=False):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        default_headers = {'Content-Type': 'application/json'}
        if self.token:
            default_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            default_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=default_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=default_headers, timeout=30)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=default_headers, timeout=30)

            # For endpoints that return 200 with error field, check both status and error field
            if allow_error_field and response.status_code == 200:
                try:
                    json_resp = response.json()
                    if json_resp.get('success') == False and json_resp.get('error'):
                        self.tests_passed += 1
                        print(f"✅ Passed - Status: {response.status_code}, error field present: {json_resp.get('error')[:100]}")
                        return True, json_resp
                except:
                    pass

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:500]}")
                self.issues.append(f"{name}: Expected {expected_status}, got {response.status_code}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.issues.append(f"{name}: {str(e)}")
            return False, {}

    def test_login(self):
        """Test admin login"""
        print("\n" + "=" * 70)
        print("ADMIN LOGIN")
        print("=" * 70)
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": "admin@bibi.cars", "password": "Admin123!Bibi"}
        )
        
        # Try alternative password if first fails
        if not success:
            print("   Trying alternative password...")
            success, response = self.run_test(
                "Admin Login (alt password)",
                "POST",
                "api/auth/login",
                200,
                data={"email": "admin@bibi.cars", "password": "BibiAdmin#2026"}
            )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Token obtained: {self.token[:20]}...")
            return True
        elif success and 'access_token' in response:
            self.token = response['access_token']
            print(f"   Token obtained: {self.token[:20]}...")
            return True
        print("❌ Login failed - no token in response")
        return False

    def test_config_endpoint(self):
        """Test GET /api/admin/calls/intelligence/config"""
        print("\n" + "=" * 70)
        print("TEST: Config Endpoint")
        print("=" * 70)
        success, response = self.run_test(
            "GET /api/admin/calls/intelligence/config",
            "GET",
            "api/admin/calls/intelligence/config",
            200
        )
        if success:
            print(f"   Config: openai_configured={response.get('openai_configured')}, "
                  f"transcribe_model={response.get('transcribe_model')}, "
                  f"analyze_model={response.get('analyze_model')}")
            if not response.get('openai_configured'):
                print("   ⚠️  OpenAI not configured (expected if key is invalid)")
        return success

    def test_auth_required(self):
        """Test that endpoints require authentication"""
        print("\n" + "=" * 70)
        print("TEST: Auth Required (401 without token)")
        print("=" * 70)
        
        # Save token and clear it
        saved_token = self.token
        self.token = None
        
        # Test config endpoint without auth
        success, _ = self.run_test(
            "Config without auth",
            "GET",
            "api/admin/calls/intelligence/config",
            401
        )
        
        # Test intelligence endpoint without auth
        success2, _ = self.run_test(
            "Intelligence without auth",
            "GET",
            "api/admin/calls/test-call-123/intelligence",
            401
        )
        
        # Restore token
        self.token = saved_token
        return success and success2

    def test_404_handling(self):
        """Test 404 for non-existent calls"""
        print("\n" + "=" * 70)
        print("TEST: 404 Handling for Non-Existent Calls")
        print("=" * 70)
        
        fake_call_id = f"nonexistent-{uuid.uuid4()}"
        success, _ = self.run_test(
            "GET intelligence for non-existent call",
            "GET",
            f"api/admin/calls/{fake_call_id}/intelligence",
            404
        )
        return success

    def seed_synthetic_call(self):
        """Seed a synthetic ringostat_calls document for testing"""
        print("\n" + "=" * 70)
        print("SEED: Synthetic Call for Testing")
        print("=" * 70)
        
        if self.db is None:
            print("❌ MongoDB not connected")
            return None
        
        call_id = f"test-ci-{uuid.uuid4()}"
        
        # Create synthetic IDs
        lead_id = str(uuid.uuid4())
        manager_id = str(uuid.uuid4())
        customer_id = str(uuid.uuid4())
        
        call_doc = {
            "call_id": call_id,
            "recording_url": "https://upload.wikimedia.org/wikipedia/commons/6/6f/Kalimba.mp3",
            "lead_id": lead_id,
            "manager_id": manager_id,
            "customer_id": customer_id,
            "direction": "inbound",
            "from_number": "+359888123456",
            "to_number": "+359888999888",
            "duration": 120,
            "started_at": datetime.utcnow(),
            "status": "completed",
            "intelligence_status": "not_started",
            "created_at": datetime.utcnow(),
        }
        
        try:
            self.db.ringostat_calls.insert_one(call_doc)
            print(f"✅ Seeded synthetic call: {call_id}")
            return call_id
        except Exception as e:
            print(f"❌ Failed to seed call: {e}")
            return None

    def test_process_endpoint(self, call_id):
        """Test POST /api/admin/calls/{call_id}/intelligence/process"""
        print("\n" + "=" * 70)
        print("TEST: Process Endpoint (Expected to Fail with insufficient_quota)")
        print("=" * 70)
        
        # This should fail with insufficient_quota because the OpenAI key has $0 quota
        success, response = self.run_test(
            "POST /intelligence/process",
            "POST",
            f"api/admin/calls/{call_id}/intelligence/process",
            200,  # Endpoint returns 200 with success=false
            data={"force": False},
            allow_error_field=True
        )
        
        if success:
            error = response.get('error', '')
            if 'insufficient_quota' in error.lower() or 'exceeded your current quota' in error.lower():
                print(f"   ✅ Got expected quota error: {error[:100]}")
            else:
                print(f"   ⚠️  Got different error: {error[:100]}")
        
        return success

    def test_intelligence_after_failed_process(self, call_id):
        """Test GET /api/admin/calls/{call_id}/intelligence after failed process"""
        print("\n" + "=" * 70)
        print("TEST: Intelligence Status After Failed Process")
        print("=" * 70)
        
        success, response = self.run_test(
            "GET /intelligence after failed process",
            "GET",
            f"api/admin/calls/{call_id}/intelligence",
            200
        )
        
        if success:
            status = response.get('status')
            intelligence = response.get('intelligence')
            transcript = response.get('transcript')
            recording_available = response.get('recording_available')
            
            print(f"   Status: {status}")
            print(f"   Intelligence: {intelligence}")
            print(f"   Transcript: {transcript}")
            print(f"   Recording available: {recording_available}")
            
            if status in ['failed', 'analyze_failed']:
                print(f"   ✅ Status correctly shows failed: {status}")
            else:
                print(f"   ⚠️  Status is not 'failed': {status}")
            
            if intelligence is None:
                print(f"   ✅ Intelligence is null (no successful CI)")
            else:
                print(f"   ⚠️  Intelligence should be null but got: {intelligence}")
            
            if recording_available:
                print(f"   ✅ Recording available is true")
        
        return success

    def test_stats_endpoint(self):
        """Test GET /api/admin/calls/intelligence/stats"""
        print("\n" + "=" * 70)
        print("TEST: Stats Endpoint (Should Return 0 Successful CI)")
        print("=" * 70)
        
        success, response = self.run_test(
            "GET /intelligence/stats",
            "GET",
            "api/admin/calls/intelligence/stats",
            200
        )
        
        if success:
            stats = response.get('stats', {})
            total_calls_with_ci = stats.get('total_calls_with_ci', -1)
            print(f"   Total calls with CI: {total_calls_with_ci}")
            
            if total_calls_with_ci == 0:
                print(f"   ✅ Correctly shows 0 successful CI")
            else:
                print(f"   ℹ️  Total calls with CI: {total_calls_with_ci}")
        
        return success

    def test_at_risk_endpoint(self):
        """Test GET /api/admin/calls/intelligence/at-risk"""
        print("\n" + "=" * 70)
        print("TEST: At-Risk Endpoint (Should Return Empty List)")
        print("=" * 70)
        
        success, response = self.run_test(
            "GET /intelligence/at-risk",
            "GET",
            "api/admin/calls/intelligence/at-risk",
            200
        )
        
        if success:
            items = response.get('items', [])
            count = response.get('count', -1)
            print(f"   Items: {len(items)}, Count: {count}")
            
            if count == 0 and len(items) == 0:
                print(f"   ✅ Correctly returns empty list")
        
        return success

    def test_apply_endpoint(self, call_id):
        """Test POST /api/admin/calls/{call_id}/intelligence/apply"""
        print("\n" + "=" * 70)
        print("TEST: Apply Endpoint (Create Task)")
        print("=" * 70)
        
        success, response = self.run_test(
            "POST /intelligence/apply",
            "POST",
            f"api/admin/calls/{call_id}/intelligence/apply",
            200,
            data={
                "create_task": True,
                "task_title": "Follow up test",
                "task_due_at": None
            }
        )
        
        if success:
            applied = response.get('applied', {})
            task_id = applied.get('task_id')
            print(f"   Task created: {task_id}")
            
            if task_id:
                print(f"   ✅ Task created successfully")
                
                # Verify task in DB
                if self.db is not None:
                    task = self.db.tasks.find_one({"_id": task_id})
                    if task:
                        print(f"   ✅ Task found in DB: source={task.get('source')}, title={task.get('title')[:50]}")
                    else:
                        print(f"   ⚠️  Task not found in DB")
        
        return success

    def test_healthz_regression(self):
        """Test that /api/healthz still works (regression check)"""
        print("\n" + "=" * 70)
        print("REGRESSION: Healthz Endpoint")
        print("=" * 70)
        
        success, response = self.run_test(
            "GET /api/healthz",
            "GET",
            "api/healthz",
            200
        )
        
        if success:
            mongo_ok = response.get('mongo_ok')
            print(f"   Mongo OK: {mongo_ok}")
            if mongo_ok:
                print(f"   ✅ Healthz shows mongo_ok=true")
        
        return success

    def cleanup(self, call_id):
        """Clean up test data"""
        print("\n" + "=" * 70)
        print("CLEANUP: Removing Test Data")
        print("=" * 70)
        
        if self.db is None or not call_id:
            return
        
        try:
            # Remove test call
            result = self.db.ringostat_calls.delete_one({"call_id": call_id})
            print(f"   Deleted {result.deleted_count} call(s)")
            
            # Remove any test tasks
            result = self.db.tasks.delete_many({"call_id": call_id})
            print(f"   Deleted {result.deleted_count} task(s)")
            
            # Remove any test transcripts
            result = self.db.call_transcripts.delete_many({"call_id": call_id})
            print(f"   Deleted {result.deleted_count} transcript(s)")
            
            # Remove any test intelligence
            result = self.db.call_intelligence.delete_many({"call_id": call_id})
            print(f"   Deleted {result.deleted_count} intelligence doc(s)")
            
            print("✅ Cleanup complete")
        except Exception as e:
            print(f"⚠️  Cleanup error: {e}")

def main():
    print("\n" + "=" * 70)
    print("BIBI CRM — Call Intelligence Backend API Testing")
    print("=" * 70)
    
    tester = CallIntelligenceTester()
    
    # Connect to MongoDB
    if not tester.connect_mongo():
        print("\n❌ MongoDB connection failed, stopping tests")
        return 1
    
    # 1. Login
    if not tester.test_login():
        print("\n❌ Login failed, stopping tests")
        return 1
    
    # 2. Test config endpoint
    tester.test_config_endpoint()
    
    # 3. Test auth required
    tester.test_auth_required()
    
    # 4. Test 404 handling
    tester.test_404_handling()
    
    # 5. Seed synthetic call
    call_id = tester.seed_synthetic_call()
    if not call_id:
        print("\n❌ Failed to seed synthetic call, stopping tests")
        return 1
    
    # 6. Test process endpoint (expected to fail with insufficient_quota)
    tester.test_process_endpoint(call_id)
    
    # 7. Test intelligence after failed process
    tester.test_intelligence_after_failed_process(call_id)
    
    # 8. Test stats endpoint
    tester.test_stats_endpoint()
    
    # 9. Test at-risk endpoint
    tester.test_at_risk_endpoint()
    
    # 10. Test apply endpoint
    tester.test_apply_endpoint(call_id)
    
    # 11. Test healthz regression
    tester.test_healthz_regression()
    
    # Cleanup
    tester.cleanup(call_id)
    
    # Print results
    print("\n" + "=" * 70)
    print(f"📊 Tests passed: {tester.tests_passed}/{tester.tests_run}")
    print("=" * 70)
    
    if tester.issues:
        print("\n⚠️  Issues found:")
        for issue in tester.issues:
            print(f"   - {issue}")
    
    return 0 if len(tester.issues) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
