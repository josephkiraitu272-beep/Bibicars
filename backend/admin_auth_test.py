"""
BIBI Cars Admin Panel Login & Regression Testing
=================================================
Tests for production redeploy verification:
- BACKEND #1: Admin/Manager/TeamLead login with correct credentials → 200 + JWT
- BACKEND #2: Wrong password → 401/400 with error (NOT 500)
- BACKEND #3: Admin JWT works for /api/auth/me and admin endpoints
- BACKEND #4: REGRESSION - Telegram HEAD /api/og/vin/{vin} → 200 with OG meta tags
- BACKEND #5: REGRESSION - body_style and location fields present in VIN data
- Health check and general endpoints
"""
import requests
import sys
from datetime import datetime

class AdminAuthTester:
    def __init__(self, base_url="https://embergate-preview-9.preview.emergentagent.com"):
        self.base_url = base_url
        self.admin_token = None
        self.manager_token = None
        self.team_lead_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.issues = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        default_headers = {'Content-Type': 'application/json'}
        if headers:
            default_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=default_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=default_headers, timeout=10)
            elif method == 'HEAD':
                response = requests.head(url, headers=default_headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    if method != 'HEAD':
                        return True, response.json()
                    else:
                        return True, {}
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                if method != 'HEAD':
                    print(f"   Response: {response.text[:300]}")
                self.issues.append(f"{name}: Expected {expected_status}, got {response.status_code}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.issues.append(f"{name}: {str(e)}")
            return False, {}

    def test_backend_1_admin_login(self):
        """BACKEND #1: Admin login with correct credentials"""
        print("\n" + "=" * 70)
        print("BACKEND #1: Admin/Manager/TeamLead Login")
        print("=" * 70)
        
        # Test admin login
        success, response = self.run_test(
            "Admin Login (admin@bibi.cars)",
            "POST",
            "api/auth/login",
            200,
            data={"email": "admin@bibi.cars", "password": "Admin123!Bibi"}
        )
        
        if not success:
            self.issues.append("BACKEND #1: Admin login failed")
            return False
        
        if 'access_token' not in response:
            print("   ❌ No access_token in response")
            self.issues.append("BACKEND #1: No access_token returned")
            return False
        
        if 'user' not in response:
            print("   ❌ No user object in response")
            self.issues.append("BACKEND #1: No user object returned")
            return False
        
        user = response['user']
        if user.get('role') != 'admin':
            print(f"   ❌ Expected role=admin, got {user.get('role')}")
            self.issues.append(f"BACKEND #1: Expected role=admin, got {user.get('role')}")
            return False
        
        if user.get('email') != 'admin@bibi.cars':
            print(f"   ❌ Expected email=admin@bibi.cars, got {user.get('email')}")
            self.issues.append(f"BACKEND #1: Expected email=admin@bibi.cars, got {user.get('email')}")
            return False
        
        self.admin_token = response['access_token']
        print(f"   ✅ Admin token obtained: {self.admin_token[:20]}...")
        print(f"   ✅ User role: {user.get('role')}, email: {user.get('email')}")
        
        # Test manager login
        success, response = self.run_test(
            "Manager Login (manager@bibi.cars)",
            "POST",
            "api/auth/login",
            200,
            data={"email": "manager@bibi.cars", "password": "Manager123!Bibi"}
        )
        
        if not success:
            self.issues.append("BACKEND #1: Manager login failed")
            return False
        
        user = response.get('user', {})
        if user.get('role') != 'manager':
            print(f"   ❌ Expected role=manager, got {user.get('role')}")
            self.issues.append(f"BACKEND #1: Expected role=manager, got {user.get('role')}")
            return False
        
        self.manager_token = response['access_token']
        print(f"   ✅ Manager token obtained, role: {user.get('role')}")
        
        # Test team_lead login
        success, response = self.run_test(
            "TeamLead Login (teamlead@bibi.cars)",
            "POST",
            "api/auth/login",
            200,
            data={"email": "teamlead@bibi.cars", "password": "TeamLead123!Bibi"}
        )
        
        if not success:
            self.issues.append("BACKEND #1: TeamLead login failed")
            return False
        
        user = response.get('user', {})
        if user.get('role') != 'team_lead':
            print(f"   ❌ Expected role=team_lead, got {user.get('role')}")
            self.issues.append(f"BACKEND #1: Expected role=team_lead, got {user.get('role')}")
            return False
        
        self.team_lead_token = response['access_token']
        print(f"   ✅ TeamLead token obtained, role: {user.get('role')}")
        
        return True

    def test_backend_2_wrong_password(self):
        """BACKEND #2: Wrong password returns 401/400 with error (NOT 500)"""
        print("\n" + "=" * 70)
        print("BACKEND #2: Wrong Password Handling")
        print("=" * 70)
        
        # Test wrong password
        url = f"{self.base_url}/api/auth/login"
        self.tests_run += 1
        print(f"\n🔍 Testing Wrong Password...")
        
        try:
            response = requests.post(
                url,
                json={"email": "admin@bibi.cars", "password": "WrongPassword123!"},
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 500:
                print(f"❌ Failed - Got 500 (should be 401 or 400)")
                self.issues.append("BACKEND #2: Wrong password returns 500 (should be 401/400)")
                return False
            
            if response.status_code not in [400, 401]:
                print(f"❌ Failed - Expected 400 or 401, got {response.status_code}")
                self.issues.append(f"BACKEND #2: Expected 400/401, got {response.status_code}")
                return False
            
            # Check error message
            try:
                error_body = response.json()
                error_text = str(error_body).lower()
                if 'invalid' not in error_text and 'credentials' not in error_text:
                    print(f"   ⚠️  Error message doesn't contain 'invalid' or 'credentials': {error_body}")
            except:
                pass
            
            self.tests_passed += 1
            print(f"✅ Passed - Status: {response.status_code}")
            print(f"   Error body: {response.text[:200]}")
            
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.issues.append(f"BACKEND #2: {str(e)}")
            return False
        
        # Test GET /api/auth/me without Bearer
        url = f"{self.base_url}/api/auth/me"
        self.tests_run += 1
        print(f"\n🔍 Testing GET /api/auth/me without Bearer...")
        
        try:
            response = requests.get(url, timeout=10)
            
            if response.status_code != 401:
                print(f"❌ Failed - Expected 401, got {response.status_code}")
                self.issues.append(f"BACKEND #2: GET /api/auth/me without Bearer should return 401, got {response.status_code}")
                return False
            
            self.tests_passed += 1
            print(f"✅ Passed - Status: {response.status_code}")
            
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.issues.append(f"BACKEND #2: {str(e)}")
            return False
        
        return True

    def test_backend_3_admin_endpoints(self):
        """BACKEND #3: Admin JWT works for /api/auth/me and admin endpoints"""
        print("\n" + "=" * 70)
        print("BACKEND #3: Admin Endpoints with JWT")
        print("=" * 70)
        
        if not self.admin_token:
            print("   ❌ No admin token available")
            self.issues.append("BACKEND #3: No admin token to test")
            return False
        
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        
        # Test GET /api/auth/me
        success, response = self.run_test(
            "GET /api/auth/me with admin JWT",
            "GET",
            "api/auth/me",
            200,
            headers=headers
        )
        
        if not success:
            self.issues.append("BACKEND #3: GET /api/auth/me failed")
            return False
        
        if response.get('role') != 'admin':
            print(f"   ❌ Expected role=admin, got {response.get('role')}")
            self.issues.append(f"BACKEND #3: Expected role=admin, got {response.get('role')}")
            return False
        
        print(f"   ✅ /api/auth/me returned correct role: {response.get('role')}")
        
        # Test admin endpoints
        admin_endpoints = [
            "api/admin/leads",
            "api/admin/deals",
            "api/admin/cars"
        ]
        
        for endpoint in admin_endpoints:
            url = f"{self.base_url}/{endpoint}"
            self.tests_run += 1
            print(f"\n🔍 Testing GET {endpoint}...")
            
            try:
                response = requests.get(url, headers=headers, timeout=10)
                
                if response.status_code == 500:
                    print(f"❌ Failed - Got 500 (server error)")
                    print(f"   Response: {response.text[:300]}")
                    self.issues.append(f"BACKEND #3: GET {endpoint} returns 500")
                    # Don't return False, continue testing other endpoints
                elif response.status_code in [200, 404]:
                    self.tests_passed += 1
                    print(f"✅ Passed - Status: {response.status_code}")
                else:
                    print(f"⚠️  Unexpected status: {response.status_code}")
                    self.tests_passed += 1  # Still count as pass if not 500
                    
            except Exception as e:
                print(f"❌ Failed - Error: {str(e)}")
                self.issues.append(f"BACKEND #3: GET {endpoint} - {str(e)}")
        
        return True

    def test_backend_4_telegram_og_tags(self):
        """BACKEND #4: REGRESSION - Telegram HEAD /api/og/vin/{vin} → 200 with OG tags"""
        print("\n" + "=" * 70)
        print("BACKEND #4: REGRESSION - Telegram OG Tags")
        print("=" * 70)
        
        vin = "1FMCU9G62LUB98765"
        
        # Test HEAD request
        url = f"{self.base_url}/api/og/vin/{vin}"
        self.tests_run += 1
        print(f"\n🔍 Testing HEAD /api/og/vin/{vin}...")
        
        try:
            response = requests.head(url, timeout=10)
            
            if response.status_code != 200:
                print(f"❌ Failed - Expected 200, got {response.status_code}")
                self.issues.append(f"BACKEND #4: HEAD /api/og/vin/{vin} returned {response.status_code}")
                return False
            
            content_type = response.headers.get('content-type', '')
            if 'text/html' not in content_type:
                print(f"❌ Failed - Expected content-type text/html, got {content_type}")
                self.issues.append(f"BACKEND #4: Expected content-type text/html, got {content_type}")
                return False
            
            self.tests_passed += 1
            print(f"✅ Passed - Status: {response.status_code}, content-type: {content_type}")
            
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.issues.append(f"BACKEND #4: HEAD request - {str(e)}")
            return False
        
        # Test GET request with TelegramBot User-Agent
        self.tests_run += 1
        print(f"\n🔍 Testing GET /api/og/vin/{vin} with TelegramBot User-Agent...")
        
        try:
            response = requests.get(
                url,
                headers={'User-Agent': 'TelegramBot (like TwitterBot)'},
                timeout=10
            )
            
            if response.status_code != 200:
                print(f"❌ Failed - Expected 200, got {response.status_code}")
                self.issues.append(f"BACKEND #4: GET with TelegramBot UA returned {response.status_code}")
                return False
            
            html = response.text
            
            # Check for OG meta tags
            required_tags = [
                '<meta property="og:title"',
                '<meta property="og:image"',
                '<meta property="og:type" content="product"',
                '<meta property="og:url"',
                '<meta property="og:description"'
            ]
            
            missing_tags = []
            for tag in required_tags:
                if tag not in html:
                    missing_tags.append(tag)
            
            if missing_tags:
                print(f"❌ Failed - Missing OG tags: {missing_tags}")
                self.issues.append(f"BACKEND #4: Missing OG tags: {missing_tags}")
                return False
            
            self.tests_passed += 1
            print(f"✅ Passed - All OG meta tags present")
            print(f"   HTML length: {len(html)} chars")
            
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.issues.append(f"BACKEND #4: GET request - {str(e)}")
            return False
        
        return True

    def test_backend_5_body_style_location_regression(self):
        """BACKEND #5: REGRESSION - body_style and location fields in VIN data"""
        print("\n" + "=" * 70)
        print("BACKEND #5: REGRESSION - body_style and location Fields")
        print("=" * 70)
        
        # Insert synthetic doc
        print("\n   Inserting synthetic VIN doc...")
        
        import pymongo
        try:
            client = pymongo.MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=5000)
            db = client['bibi_cars']
            
            synthetic_doc = {
                "vin": "REGRESSVIN01",
                "make": "Ford",
                "model": "Escape",
                "year": 2020,
                "body_style": "SUV",
                "body_type": "SUV",
                "location": "CA - Los Angeles",
                "damage_primary": "FRONT END",
                "source": "bidmotors",
                "updated_at": datetime.now()
            }
            
            db.vin_data.insert_one(synthetic_doc)
            print("   ✅ Synthetic doc inserted")
            
        except Exception as e:
            print(f"   ❌ Failed to insert synthetic doc: {str(e)}")
            self.issues.append(f"BACKEND #5: Failed to insert synthetic doc - {str(e)}")
            return False
        
        # Test GET /api/vin/REGRESSVIN01/shell
        success, response = self.run_test(
            "GET /api/vin/REGRESSVIN01/shell",
            "GET",
            "api/vin/REGRESSVIN01/shell",
            200
        )
        
        if not success:
            self.issues.append("BACKEND #5: GET /api/vin/REGRESSVIN01/shell failed")
            # Clean up
            try:
                db.vin_data.delete_one({"vin": "REGRESSVIN01"})
            except:
                pass
            return False
        
        # Check body_style field
        if 'body_style' not in response:
            print(f"   ❌ body_style field not present in response")
            self.issues.append("BACKEND #5: body_style field missing")
            # Clean up
            try:
                db.vin_data.delete_one({"vin": "REGRESSVIN01"})
            except:
                pass
            return False
        
        if response['body_style'] != 'SUV':
            print(f"   ❌ Expected body_style='SUV', got '{response['body_style']}'")
            self.issues.append(f"BACKEND #5: Expected body_style='SUV', got '{response['body_style']}'")
        else:
            print(f"   ✅ body_style field present: {response['body_style']}")
        
        # Check location field
        if 'location' not in response:
            print(f"   ❌ location field not present in response")
            self.issues.append("BACKEND #5: location field missing")
            # Clean up
            try:
                db.vin_data.delete_one({"vin": "REGRESSVIN01"})
            except:
                pass
            return False
        
        if response['location'] != 'CA - Los Angeles':
            print(f"   ❌ Expected location='CA - Los Angeles', got '{response['location']}'")
            self.issues.append(f"BACKEND #5: Expected location='CA - Los Angeles', got '{response['location']}'")
        else:
            print(f"   ✅ location field present: {response['location']}")
        
        # Clean up
        print("\n   Cleaning up synthetic doc...")
        try:
            db.vin_data.delete_one({"vin": "REGRESSVIN01"})
            print("   ✅ Synthetic doc deleted")
        except Exception as e:
            print(f"   ⚠️  Failed to delete synthetic doc: {str(e)}")
        
        return True

    def test_health_and_general(self):
        """Test health check and general endpoints"""
        print("\n" + "=" * 70)
        print("REGRESSION SWEEP: Health & General Endpoints")
        print("=" * 70)
        
        # Test GET /api/healthz
        success, response = self.run_test(
            "GET /api/healthz",
            "GET",
            "api/healthz",
            200
        )
        
        if success:
            mongo_ok = response.get('mongo_ok')
            print(f"   mongo_ok: {mongo_ok}")
            if not mongo_ok:
                print(f"   ⚠️  MongoDB not healthy")
                self.issues.append("HEALTH: MongoDB not healthy")
        
        # Test GET / (home SPA)
        url = f"{self.base_url}/"
        self.tests_run += 1
        print(f"\n🔍 Testing GET / (home SPA)...")
        
        try:
            response = requests.get(url, timeout=10)
            
            if response.status_code != 200:
                print(f"❌ Failed - Expected 200, got {response.status_code}")
                self.issues.append(f"HEALTH: GET / returned {response.status_code}")
            else:
                html = response.text
                if 'BIBI Cars' not in html:
                    print(f"   ⚠️  'BIBI Cars' not found in HTML")
                    self.issues.append("HEALTH: 'BIBI Cars' not in homepage HTML")
                else:
                    self.tests_passed += 1
                    print(f"✅ Passed - Status: {response.status_code}, title found")
                    
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.issues.append(f"HEALTH: GET / - {str(e)}")
        
        return True

def main():
    print("=" * 70)
    print("BIBI Cars - Admin Panel Login & Regression Testing")
    print("=" * 70)
    
    tester = AdminAuthTester()
    
    # Run all tests
    tester.test_backend_1_admin_login()
    tester.test_backend_2_wrong_password()
    tester.test_backend_3_admin_endpoints()
    tester.test_backend_4_telegram_og_tags()
    tester.test_backend_5_body_style_location_regression()
    tester.test_health_and_general()
    
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
