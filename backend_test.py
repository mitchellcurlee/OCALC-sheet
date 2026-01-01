import requests
import sys
import json
from datetime import datetime

class PoleAPITester:
    def __init__(self, base_url="https://pole-inspector-1.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.created_pole_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json() if response.content else {}
                    if response_data:
                        print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                except:
                    response_data = {}
                return True, response_data
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json() if response.content else {}
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Raw response: {response.text[:200]}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root API", "GET", "", 200)

    def test_get_pole_options(self):
        """Test getting pole form options"""
        success, response = self.run_test("Get Pole Options", "GET", "poles/options", 200)
        if success:
            required_keys = ['pole_types', 'conditions', 'sizes']
            for key in required_keys:
                if key not in response:
                    print(f"❌ Missing required key: {key}")
                    return False
            print(f"   Options available: {list(response.keys())}")
        return success

    def test_get_stats(self):
        """Test getting pole statistics"""
        success, response = self.run_test("Get Stats", "GET", "stats", 200)
        if success:
            required_keys = ['total_poles', 'power_poles', 'telecom_poles', 'by_condition']
            for key in required_keys:
                if key not in response:
                    print(f"❌ Missing required key: {key}")
                    return False
            print(f"   Stats: Total={response.get('total_poles')}, Power={response.get('power_poles')}, Telecom={response.get('telecom_poles')}")
        return success

    def test_create_power_pole(self):
        """Create a test power pole"""
        pole_data = {
            "pole_type": "Power",
            "pole_size": "Medium (35-45ft)",
            "telecom_attachments": 2,
            "condition": "Good",
            "down_guy_height": 15.5,
            "lead_anchor_characteristics": "Steel anchor, 6ft lead",
            "ground_type": "Concrete",
            "riser_number": 3,
            "height_of_attachment": 25.0,
            "latitude": 37.7749,
            "longitude": -122.4194,
            "notes": "Test power pole created by automated testing"
        }
        
        success, response = self.run_test("Create Power Pole", "POST", "poles", 201, data=pole_data)
        if success and 'id' in response:
            self.created_pole_id = response['id']
            print(f"   Created pole ID: {self.created_pole_id}")
        return success

    def test_create_telecom_pole(self):
        """Create a test telecom pole"""
        pole_data = {
            "pole_type": "Telecom",
            "pole_size": "Small (20-30ft)",
            "telecom_attachments": 5,
            "condition": "Excellent",
            "down_guy_height": 12.0,
            "lead_anchor_characteristics": "Aluminum anchor, 4ft lead",
            "ground_type": "Soil",
            "riser_number": 1,
            "height_of_attachment": 20.0,
            "latitude": 37.7849,
            "longitude": -122.4094,
            "notes": "Test telecom pole created by automated testing"
        }
        
        success, response = self.run_test("Create Telecom Pole", "POST", "poles", 201, data=pole_data)
        return success

    def test_get_all_poles(self):
        """Test getting all poles"""
        return self.run_test("Get All Poles", "GET", "poles", 200)

    def test_get_poles_filtered_by_type(self):
        """Test filtering poles by type"""
        success1, _ = self.run_test("Filter Power Poles", "GET", "poles", 200, params={"pole_type": "Power"})
        success2, _ = self.run_test("Filter Telecom Poles", "GET", "poles", 200, params={"pole_type": "Telecom"})
        return success1 and success2

    def test_get_poles_filtered_by_condition(self):
        """Test filtering poles by condition"""
        return self.run_test("Filter by Condition", "GET", "poles", 200, params={"condition": "Good"})

    def test_get_single_pole(self):
        """Test getting a single pole by ID"""
        if not self.created_pole_id:
            print("❌ No pole ID available for testing")
            return False
        return self.run_test("Get Single Pole", "GET", f"poles/{self.created_pole_id}", 200)

    def test_update_pole(self):
        """Test updating a pole"""
        if not self.created_pole_id:
            print("❌ No pole ID available for testing")
            return False
        
        update_data = {
            "condition": "Fair",
            "notes": "Updated by automated testing - condition changed to Fair"
        }
        
        return self.run_test("Update Pole", "PUT", f"poles/{self.created_pole_id}", 200, data=update_data)

    def test_export_excel(self):
        """Test Excel export functionality"""
        success, _ = self.run_test("Export Excel", "GET", "poles/export/excel", 200)
        return success

    def test_delete_pole(self):
        """Test deleting a pole"""
        if not self.created_pole_id:
            print("❌ No pole ID available for testing")
            return False
        
        return self.run_test("Delete Pole", "DELETE", f"poles/{self.created_pole_id}", 200)

    def test_get_nonexistent_pole(self):
        """Test getting a non-existent pole (should return 404)"""
        fake_id = "nonexistent-pole-id-12345"
        return self.run_test("Get Non-existent Pole", "GET", f"poles/{fake_id}", 404)

def main():
    print("🚀 Starting Power Pole API Testing...")
    print("=" * 60)
    
    tester = PoleAPITester()
    
    # Test sequence
    test_functions = [
        tester.test_root_endpoint,
        tester.test_get_pole_options,
        tester.test_get_stats,
        tester.test_get_all_poles,
        tester.test_create_power_pole,
        tester.test_create_telecom_pole,
        tester.test_get_all_poles,
        tester.test_get_poles_filtered_by_type,
        tester.test_get_poles_filtered_by_condition,
        tester.test_get_single_pole,
        tester.test_update_pole,
        tester.test_export_excel,
        tester.test_get_nonexistent_pole,
        tester.test_delete_pole,
    ]
    
    # Run all tests
    for test_func in test_functions:
        try:
            test_func()
        except Exception as e:
            print(f"❌ Test {test_func.__name__} failed with exception: {str(e)}")
    
    # Print results
    print("\n" + "=" * 60)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())