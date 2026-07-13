"""
VIN Auction Fields Backend API Testing
========================================
Tests for the new auction fields implementation:
- starting_bid, starting_bid_currency
- estimated_total_price, estimated_total_currency
- damage_secondary
- odometer_unit
- body_style (extended labels)

Test Requirements:
- API-1: GET /api/vin/2T1BU4EE0BC625239/shell - verify all new keys present
- API-2: GET /api/vin/ZARFAMAN9K7603604/enrich - verify all new keys present
- REGRESSION-1: Invalid VIN shows error
"""
import requests
import sys
import time

class VINAuctionFieldsTester:
    def __init__(self, base_url="https://embergate-preview-6.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.issues = []
        
        # Required keys that MUST be present in API responses (even if null)
        self.required_keys = [
            'starting_bid',
            'starting_bid_currency',
            'estimated_total_price',
            'estimated_total_currency',
            'damage_secondary',
            'odometer_unit',
            'body_style',
            'damage_primary',
            'location',
        ]

    def run_test(self, name, method, endpoint, expected_status, timeout=10):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=timeout)
            else:
                print(f"❌ Unsupported method: {method}")
                return False, {}

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

        except requests.exceptions.Timeout:
            print(f"❌ Failed - Request timeout after {timeout}s")
            self.issues.append(f"{name}: Timeout after {timeout}s")
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.issues.append(f"{name}: {str(e)}")
            return False, {}

    def verify_keys_present(self, test_name, data_dict, required_keys):
        """Verify that all required keys are present in the data dict"""
        print(f"\n   🔑 Verifying required keys in {test_name}...")
        missing_keys = []
        present_keys = []
        
        for key in required_keys:
            if key in data_dict:
                value = data_dict[key]
                present_keys.append(f"{key}={repr(value)[:50]}")
                print(f"   ✓ {key}: {repr(value)[:80]}")
            else:
                missing_keys.append(key)
                print(f"   ✗ MISSING: {key}")
        
        if missing_keys:
            issue = f"{test_name}: Missing keys {missing_keys}"
            self.issues.append(issue)
            print(f"\n   ❌ CRITICAL: Keys missing from response!")
            return False
        else:
            print(f"\n   ✅ All {len(required_keys)} required keys present")
            return True

    def test_api_1_shell_toyota(self):
        """API-1: GET /api/vin/2T1BU4EE0BC625239/shell - Toyota Corolla"""
        print("\n" + "=" * 80)
        print("API-1: Shell Endpoint - Toyota Corolla (2T1BU4EE0BC625239)")
        print("=" * 80)
        
        success, response = self.run_test(
            "Shell API - Toyota Corolla",
            "GET",
            "api/vin/2T1BU4EE0BC625239/shell",
            200,
            timeout=10
        )
        
        if not success:
            self.issues.append("API-1: Shell endpoint failed")
            return False
        
        # Check response structure
        if 'data' not in response:
            self.issues.append("API-1: Response missing 'data' key")
            print(f"   ❌ Response missing 'data' key. Keys: {list(response.keys())}")
            return False
        
        data = response['data']
        
        # Verify all required keys are present
        keys_ok = self.verify_keys_present("API-1 Shell", data, self.required_keys)
        
        # Additional checks
        if 'vin' in data:
            print(f"\n   VIN: {data['vin']}")
        if 'make' in data and 'model' in data:
            print(f"   Vehicle: {data.get('make')} {data.get('model')} {data.get('year', '')}")
        
        return keys_ok

    def test_api_2_enrich_alfa(self):
        """API-2: GET /api/vin/ZARFAMAN9K7603604/enrich - Alfa Romeo Giulia"""
        print("\n" + "=" * 80)
        print("API-2: Enrich Endpoint - Alfa Romeo Giulia (ZARFAMAN9K7603604)")
        print("=" * 80)
        print("   ⚠️  This may take 20-30 seconds (live enrichment)...")
        
        success, response = self.run_test(
            "Enrich API - Alfa Romeo",
            "GET",
            "api/vin/ZARFAMAN9K7603604/enrich",
            200,
            timeout=35
        )
        
        if not success:
            self.issues.append("API-2: Enrich endpoint failed")
            return False
        
        # Check response structure
        if 'data' not in response:
            self.issues.append("API-2: Response missing 'data' key")
            print(f"   ❌ Response missing 'data' key. Keys: {list(response.keys())}")
            return False
        
        data = response['data']
        
        # Verify all required keys are present
        keys_ok = self.verify_keys_present("API-2 Enrich", data, self.required_keys)
        
        # Additional checks for Alfa Romeo specific data
        if 'vin' in data:
            print(f"\n   VIN: {data['vin']}")
        if 'make' in data and 'model' in data:
            print(f"   Vehicle: {data.get('make')} {data.get('model')} {data.get('year', '')}")
        if 'damage_primary' in data:
            print(f"   Damage Primary: {data.get('damage_primary')}")
        if 'location' in data:
            print(f"   Location: {data.get('location')}")
        
        return keys_ok

    def test_regression_1_invalid_vin(self):
        """REGRESSION-1: Invalid VIN should return error"""
        print("\n" + "=" * 80)
        print("REGRESSION-1: Invalid VIN Handling")
        print("=" * 80)
        
        success, response = self.run_test(
            "Invalid VIN - Shell",
            "GET",
            "api/vin/INVALID_VIN_123456789/shell",
            200,  # Shell returns 200 with found=false
            timeout=10
        )
        
        if not success:
            # If it's not 200, check if it's 404 or 422 (also acceptable)
            print("   ℹ️  Non-200 response is acceptable for invalid VIN")
            return True
        
        # If 200, check that found=false
        if 'found' in response and response['found'] is False:
            print(f"   ✅ Correctly returns found=false for invalid VIN")
            return True
        else:
            self.issues.append("REGRESSION-1: Invalid VIN should return found=false")
            print(f"   ❌ Expected found=false, got: {response.get('found')}")
            return False

def main():
    print("\n" + "=" * 80)
    print("VIN AUCTION FIELDS - BACKEND API TESTING")
    print("=" * 80)
    print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    
    tester = VINAuctionFieldsTester()
    
    # Run all tests
    test_results = []
    
    # API-1: Shell endpoint - Toyota
    test_results.append(("API-1: Shell Toyota", tester.test_api_1_shell_toyota()))
    
    # API-2: Enrich endpoint - Alfa Romeo (may take 30s)
    test_results.append(("API-2: Enrich Alfa", tester.test_api_2_enrich_alfa()))
    
    # REGRESSION-1: Invalid VIN
    test_results.append(("REGRESSION-1: Invalid VIN", tester.test_regression_1_invalid_vin()))
    
    # Print summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Tests run: {tester.tests_run}")
    print(f"Tests passed: {tester.tests_passed}")
    print(f"Tests failed: {tester.tests_run - tester.tests_passed}")
    
    if tester.issues:
        print("\n❌ ISSUES FOUND:")
        for i, issue in enumerate(tester.issues, 1):
            print(f"  {i}. {issue}")
    else:
        print("\n✅ ALL TESTS PASSED!")
    
    print("\n" + "=" * 80)
    print("DETAILED TEST RESULTS")
    print("=" * 80)
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    return 0 if len(tester.issues) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
