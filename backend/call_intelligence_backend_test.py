"""
BIBI Cars CRM - Call Intelligence Backend API Testing
======================================================
Wave 2A-CI (Jul 12, 2026) — Tests for Call Intelligence endpoints

Tests:
1. GET /api/admin/calls/intelligence/config - returns 200 with role='admin', can_configure_key=true, openai_configured=true
2. GET /api/admin/calls/intelligence/stats - returns 200 success=true and stats.total_calls_with_ci=0
3. GET /api/admin/calls/intelligence/at-risk - returns 200 success=true, items=[], count=0
4. GET /api/healthz - returns 200 mongo_ok=true (regression)
5. GET /api/admin/ringostat/calls - still returns 200 (regression)
"""
import requests
import sys
from datetime import datetime

class CallIntelligenceAPITester:
    def __init__(self, base_url="https://embergate-preview-7.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.issues = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
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
                response = requests.get(url, headers=default_headers, timeout=15)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=default_headers, timeout=15)

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
        print("AUTHENTICATION: Admin Login")
        print("=" * 70)
        
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": "admin@bibi.cars", "password": "Admin123!Bibi"}
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Token obtained: {self.token[:30]}...")
            return True
        elif success and 'access_token' in response:
            self.token = response['access_token']
            print(f"   Token obtained: {self.token[:30]}...")
            return True
        return False

    def test_ci_config(self):
        """TEST 1: GET /api/admin/calls/intelligence/config"""
        print("\n" + "=" * 70)
        print("TEST 1: Call Intelligence Config")
        print("=" * 70)
        
        success, response = self.run_test(
            "GET /api/admin/calls/intelligence/config",
            "GET",
            "api/admin/calls/intelligence/config",
            200
        )
        
        if not success:
            self.issues.append("CI Config: Failed to fetch config")
            return False
        
        # Check required fields
        role = response.get('role')
        can_configure = response.get('can_configure_key')
        openai_configured = response.get('openai_configured')
        
        print(f"   role: {role}")
        print(f"   can_configure_key: {can_configure}")
        print(f"   openai_configured: {openai_configured}")
        
        if role != 'admin':
            print(f"   ⚠️  Expected role='admin', got '{role}'")
            self.issues.append(f"CI Config: Expected role='admin', got '{role}'")
        
        if not can_configure:
            print(f"   ⚠️  Expected can_configure_key=true, got {can_configure}")
            self.issues.append(f"CI Config: Expected can_configure_key=true")
        
        if not openai_configured:
            print(f"   ⚠️  Expected openai_configured=true, got {openai_configured}")
            self.issues.append(f"CI Config: Expected openai_configured=true (key should be in env)")
        
        if role == 'admin' and can_configure and openai_configured:
            print("   ✅ All config fields correct")
            return True
        
        return False

    def test_ci_stats(self):
        """TEST 2: GET /api/admin/calls/intelligence/stats"""
        print("\n" + "=" * 70)
        print("TEST 2: Call Intelligence Stats")
        print("=" * 70)
        
        success, response = self.run_test(
            "GET /api/admin/calls/intelligence/stats",
            "GET",
            "api/admin/calls/intelligence/stats",
            200
        )
        
        if not success:
            self.issues.append("CI Stats: Failed to fetch stats")
            return False
        
        # Check required fields
        success_flag = response.get('success')
        stats = response.get('stats', {})
        total_calls = stats.get('total_calls_with_ci', -1)
        
        print(f"   success: {success_flag}")
        print(f"   stats.total_calls_with_ci: {total_calls}")
        
        if not success_flag:
            print(f"   ⚠️  Expected success=true, got {success_flag}")
            self.issues.append(f"CI Stats: Expected success=true")
        
        if total_calls == -1:
            print(f"   ⚠️  stats.total_calls_with_ci not found")
            self.issues.append(f"CI Stats: stats.total_calls_with_ci not found")
        
        # It's OK if total_calls is 0 (no calls analyzed yet)
        print(f"   ✅ Stats endpoint working (total_calls_with_ci={total_calls})")
        return True

    def test_ci_at_risk(self):
        """TEST 3: GET /api/admin/calls/intelligence/at-risk"""
        print("\n" + "=" * 70)
        print("TEST 3: Call Intelligence At-Risk Feed")
        print("=" * 70)
        
        success, response = self.run_test(
            "GET /api/admin/calls/intelligence/at-risk",
            "GET",
            "api/admin/calls/intelligence/at-risk",
            200
        )
        
        if not success:
            self.issues.append("CI At-Risk: Failed to fetch at-risk calls")
            return False
        
        # Check required fields
        success_flag = response.get('success')
        items = response.get('items', None)
        count = response.get('count', -1)
        
        print(f"   success: {success_flag}")
        print(f"   items: {items if items is None else f'array of {len(items)} items'}")
        print(f"   count: {count}")
        
        if not success_flag:
            print(f"   ⚠️  Expected success=true, got {success_flag}")
            self.issues.append(f"CI At-Risk: Expected success=true")
        
        if items is None:
            print(f"   ⚠️  items field not found")
            self.issues.append(f"CI At-Risk: items field not found")
        
        if count == -1:
            print(f"   ⚠️  count field not found")
            self.issues.append(f"CI At-Risk: count field not found")
        
        # It's OK if items=[] and count=0 (no at-risk calls yet)
        print(f"   ✅ At-risk endpoint working (count={count})")
        return True

    def test_healthz(self):
        """TEST 4: GET /api/healthz (regression)"""
        print("\n" + "=" * 70)
        print("TEST 4: Health Check (Regression)")
        print("=" * 70)
        
        success, response = self.run_test(
            "GET /api/healthz",
            "GET",
            "api/healthz",
            200
        )
        
        if not success:
            self.issues.append("Healthz: Failed to fetch health status")
            return False
        
        mongo_ok = response.get('mongo_ok')
        
        print(f"   mongo_ok: {mongo_ok}")
        
        if not mongo_ok:
            print(f"   ⚠️  Expected mongo_ok=true, got {mongo_ok}")
            self.issues.append(f"Healthz: Expected mongo_ok=true")
        
        print(f"   ✅ Health check passed")
        return True

    def test_ringostat_calls(self):
        """TEST 5: GET /api/admin/ringostat/calls (regression)"""
        print("\n" + "=" * 70)
        print("TEST 5: Ringostat Calls Endpoint (Regression)")
        print("=" * 70)
        
        success, response = self.run_test(
            "GET /api/admin/ringostat/calls",
            "GET",
            "api/admin/ringostat/calls",
            200
        )
        
        if not success:
            self.issues.append("Ringostat Calls: Failed to fetch calls")
            return False
        
        calls = response.get('calls', None)
        
        print(f"   calls: {calls if calls is None else f'array of {len(calls)} calls'}")
        
        if calls is None:
            print(f"   ⚠️  calls field not found")
            self.issues.append(f"Ringostat Calls: calls field not found")
        
        # It's OK if calls=[] (no calls yet)
        print(f"   ✅ Ringostat calls endpoint working")
        return True

def main():
    print("=" * 70)
    print("BIBI Cars CRM - Call Intelligence Backend API Testing")
    print("Wave 2A-CI (Jul 12, 2026)")
    print("=" * 70)
    
    tester = CallIntelligenceAPITester()
    
    # 1. Login
    if not tester.test_login():
        print("\n❌ Login failed, stopping tests")
        return 1
    
    # Run all tests
    tester.test_ci_config()
    tester.test_ci_stats()
    tester.test_ci_at_risk()
    tester.test_healthz()
    tester.test_ringostat_calls()
    
    # Print results
    print("\n" + "=" * 70)
    print(f"📊 Tests passed: {tester.tests_passed}/{tester.tests_run}")
    print("=" * 70)
    
    if tester.issues:
        print("\n⚠️  Issues found:")
        for issue in tester.issues:
            print(f"   - {issue}")
    else:
        print("\n✅ All tests passed!")
    
    return 0 if len(tester.issues) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
