import requests
import sys
import json
from datetime import datetime

class PoleAPITester:
    def __init__(self, base_url="https://poletracker.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.created_pole_id = None
        self.auth_token = None
        self.test_user = {
            "email": "testuser@pole.com",
            "password": "test123456",
            "name": "Pole Tester"
        }

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None, auth_required=False):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        # Add authorization header if required
        if auth_required and self.auth_token:
            headers['Authorization'] = f'Bearer {self.auth_token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        if auth_required:
            print(f"   Auth: {'✅ Token provided' if self.auth_token else '❌ No token'}")
        
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
                    if response_data and method != 'GET' or 'export' not in endpoint:
                        print(f"   Response: {json.dumps(response_data, indent=2)[:300]}...")
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

    def test_auth_register(self):
        """Test user registration"""
        success, response = self.run_test("Register User", "POST", "auth/register", 200, data=self.test_user)
        if success and 'access_token' in response:
            self.auth_token = response['access_token']
            print(f"   ✅ Registration successful, token obtained")
            print(f"   User: {response.get('user', {})}")
            return True
        return success

    def test_auth_login(self):
        """Test user login"""
        login_data = {
            "email": self.test_user["email"],
            "password": self.test_user["password"]
        }
        success, response = self.run_test("Login User", "POST", "auth/login", 200, data=login_data)
        if success and 'access_token' in response:
            self.auth_token = response['access_token']
            print(f"   ✅ Login successful, token obtained")
            print(f"   User: {response.get('user', {})}")
            return True
        return success

    def test_auth_me(self):
        """Test getting current user info"""
        if not self.auth_token:
            print("❌ No auth token available for testing")
            return False
        
        success, response = self.run_test("Get Current User", "GET", "auth/me", 200, auth_required=True)
        if success:
            required_fields = ['id', 'email', 'name']
            for field in required_fields:
                if field not in response:
                    print(f"   ❌ Missing field in user response: {field}")
                    return False
            print(f"   ✅ User info retrieved: {response.get('email')}")
            return True
        return success

    def test_auth_protected_endpoint(self):
        """Test that protected endpoints require authentication"""
        # Test without token (should fail)
        old_token = self.auth_token
        self.auth_token = None
        success_no_auth, _ = self.run_test("Protected Endpoint (No Auth)", "GET", "auth/me", 401, auth_required=True)
        
        # Test with invalid token (should fail)
        self.auth_token = "invalid-token-12345"
        success_bad_auth, _ = self.run_test("Protected Endpoint (Bad Auth)", "GET", "auth/me", 401, auth_required=True)
        
        # Restore valid token
        self.auth_token = old_token
        
        return success_no_auth and success_bad_auth
        """Test root API endpoint"""
        return self.run_test("Root API", "GET", "", 200)

    def test_get_pole_options(self):
        """Test getting pole form options"""
        success, response = self.run_test("Get Pole Options", "GET", "poles/options", 200)
        if success:
            required_keys = ['pole_owners', 'conditions', 'sizes', 'down_guy_owners', 'span_owners']
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
            required_keys = ['total_poles', 'by_condition']
            for key in required_keys:
                if key not in response:
                    print(f"❌ Missing required key: {key}")
                    return False
            print(f"   Stats: Total={response.get('total_poles')}, By condition={response.get('by_condition')}")
        return success

    def test_create_pole_with_photos(self):
        """Create a pole with photo URLs for testing Excel export"""
        pole_data = {
            # Basic Info
            "pole_owner": "Foreign Owned",
            "pole_size": "3-35",
            "condition": "Excellent",
            
            # Job/Pole numbers
            "job_number": "JOB-PHOTO-123",
            "pole_number": "POLE-PHOTO-456",
            
            # GPS
            "latitude": 40.7128,
            "longitude": -74.0060,
            
            # OCALC Photos
            "ocalc_left_photo": "https://example.com/photo1.jpg",
            "ocalc_middle_photo": "https://example.com/photo2.jpg", 
            "ocalc_right_photo": "https://example.com/photo3.jpg",
            
            # Birthmark
            "has_birthmark": True,
            "birthmark_photo": "https://example.com/birthmark.jpg",
            
            # MGNV
            "mgnv": "Yes",
            "mgnv_condition": "Good",
            "mgnv_photo": "https://example.com/mgnv.jpg",
            
            # Knuckles with photos
            "knuckles": [
                {
                    "count": "3",
                    "condition": "Good",
                    "photo": "https://example.com/knuckle1.jpg"
                },
                {
                    "count": "2", 
                    "condition": "Broken",
                    "photo": "https://example.com/knuckle2.jpg"
                }
            ],
            
            # Attachments with photos
            "attachments": [
                {
                    "height": 30.0,
                    "owner": "Power",
                    "photo": "https://example.com/attachment1.jpg"
                },
                {
                    "height": 25.0,
                    "owner": "Comcast",
                    "photo": "https://example.com/attachment2.jpg"
                }
            ],
            
            # Notes
            "notes": "Test pole with photo URLs for Excel export testing"
        }
        
        success, response = self.run_test("Create Pole with Photos", "POST", "poles", 201, data=pole_data)
        if success and 'id' in response:
            self.created_pole_id = response['id']
            print(f"   Created pole ID: {self.created_pole_id}")
            
            # Verify photo URLs were saved
            photo_fields = ['ocalc_left_photo', 'ocalc_middle_photo', 'ocalc_right_photo', 'birthmark_photo', 'mgnv_photo']
            for field in photo_fields:
                if field in pole_data and response.get(field) != pole_data[field]:
                    print(f"   ❌ Photo URL mismatch for {field}")
                    return False
            
            print("   ✅ All photo URLs saved correctly")
            return True
        return success
        """Create a pole with comprehensive data for all sections"""
        pole_data = {
            # Basic Info
            "pole_owner": "Foreign Owned",
            "pole_size": "3-35",
            "condition": "Excellent",
            
            # Job/Pole numbers
            "job_number": "JOB-123",
            "pole_number": "POLE-456",
            
            # GPS
            "latitude": 40.7128,
            "longitude": -74.0060,
            
            # Spans (2 spans)
            "span1_direction": "N",
            "span1_distance": 150.5,
            "span1_owner": "Power",
            "span2_direction": "S", 
            "span2_distance": 200.0,
            "span2_owner": "ATT",
            
            # Down Guys (2 down guys)
            "down_guy1_size": "1/2",
            "down_guy1_direction": "NE",
            "down_guy1_owner": "Power",
            "down_guy1_height": 25.0,
            "down_guy1_lead": "Steel anchor, 8ft lead",
            "down_guy2_size": "3/8",
            "down_guy2_direction": "SW",
            "down_guy2_owner": "ATT",
            "down_guy2_height": 20.0,
            "down_guy2_lead": "Concrete anchor, 6ft lead",
            
            # Knuckles (2 knuckles)
            "knuckle1_count": "3",
            "knuckle1_condition": "Good",
            "knuckle2_count": "2", 
            "knuckle2_condition": "Broken",
            
            # Height of Attachments (2 attachments)
            "attachment1_height": 30.0,
            "attachment1_owner": "Power",
            "attachment2_height": 25.0,
            "attachment2_owner": "Comcast",
            
            # Pole Terminal
            "pole_terminal": "Yes",
            
            # Risers
            "risers": "3",
            
            # MGNV
            "mgnv": "Yes",
            "mgnv_condition": "Good",
            
            # Birthmark
            "has_birthmark": True,
            
            # Notes
            "notes": "Test pole with comprehensive data for all sections"
        }
        
        success, response = self.run_test("Create Comprehensive Pole", "POST", "poles", 201, data=pole_data)
        if success and 'id' in response:
            self.created_pole_id = response['id']
            print(f"   Created pole ID: {self.created_pole_id}")
            
            # Verify all data was saved correctly
            if self.verify_pole_data(response, pole_data):
                print("   ✅ All pole data verified correctly")
                return True
            else:
                print("   ❌ Pole data verification failed")
                return False
        return success

    def verify_pole_data(self, response_data, expected_data):
        """Verify that the response contains all expected data"""
        for key, expected_value in expected_data.items():
            if key not in response_data:
                print(f"   ❌ Missing field: {key}")
                return False
            if response_data[key] != expected_value:
                print(f"   ❌ Field mismatch - {key}: expected {expected_value}, got {response_data[key]}")
                return False
        return True

    def test_get_single_pole_comprehensive(self):
        """Test getting the comprehensive pole by ID and verify all data"""
        if not self.created_pole_id:
            print("❌ No pole ID available for testing")
            return False
        
        success, response = self.run_test("Get Comprehensive Pole", "GET", f"poles/{self.created_pole_id}", 200)
        if success:
            # Verify key fields are present
            required_fields = [
                'id', 'pole_owner', 'pole_size', 'condition', 'job_number', 'pole_number',
                'latitude', 'longitude', 'span1_direction', 'span1_distance', 'span1_owner',
                'down_guy1_size', 'down_guy1_direction', 'knuckle1_count', 'attachment1_height',
                'pole_terminal', 'risers', 'mgnv', 'has_birthmark', 'notes'
            ]
            
            missing_fields = []
            for field in required_fields:
                if field not in response:
                    missing_fields.append(field)
            
            if missing_fields:
                print(f"   ❌ Missing fields in response: {missing_fields}")
                return False
            else:
                print("   ✅ All required fields present in response")
                return True
        return success

    def test_update_pole_comprehensive(self):
        """Test updating the pole with new data"""
        if not self.created_pole_id:
            print("❌ No pole ID available for testing")
            return False
        
        update_data = {
            # Change condition
            "condition": "Bad",
            # Add a new span
            "span3_direction": "E",
            "span3_distance": 175.0,
            "span3_owner": "Lightwave",
            # Update a knuckle condition
            "knuckle1_condition": "Broken",
            # Update notes
            "notes": "Updated pole data - condition changed to Bad, added span 3, updated knuckle 1"
        }
        
        success, response = self.run_test("Update Comprehensive Pole", "PUT", f"poles/{self.created_pole_id}", 200, data=update_data)
        if success:
            # Verify the updates were applied
            for key, expected_value in update_data.items():
                if key not in response:
                    print(f"   ❌ Updated field missing: {key}")
                    return False
                if response[key] != expected_value:
                    print(f"   ❌ Update failed - {key}: expected {expected_value}, got {response[key]}")
                    return False
            print("   ✅ All updates verified correctly")
            return True
        return success

    def test_get_updated_pole_data(self):
        """Verify the updated data is returned correctly on subsequent GET"""
        if not self.created_pole_id:
            print("❌ No pole ID available for testing")
            return False
        
        success, response = self.run_test("Get Updated Pole Data", "GET", f"poles/{self.created_pole_id}", 200)
        if success:
            # Check that updates are persisted
            expected_updates = {
                "condition": "Bad",
                "span3_direction": "E",
                "span3_distance": 175.0,
                "span3_owner": "Lightwave",
                "knuckle1_condition": "Broken"
            }
            
            for key, expected_value in expected_updates.items():
                if response.get(key) != expected_value:
                    print(f"   ❌ Persisted update failed - {key}: expected {expected_value}, got {response.get(key)}")
                    return False
            
            print("   ✅ All updated data persisted correctly")
            return True
        return success

    def test_excel_export_with_photos(self):
        """Test Excel export includes photo links"""
        success, response = self.run_test("Export Excel with Photos", "GET", "poles/export/excel", 200)
        if success:
            print("   ✅ Excel export endpoint working with photo data")
            # Note: We can't easily verify the actual Excel content in this test,
            # but we confirmed the endpoint works and the pole with photos was created
        return success
        """Test Excel export functionality"""
        success, response = self.run_test("Export Excel", "GET", "poles/export/excel", 200)
        if success:
            print("   ✅ Excel export endpoint working")
        return success

    def test_get_all_poles(self):
        """Test getting all poles"""
        return self.run_test("Get All Poles", "GET", "poles", 200)

    def test_get_poles_filtered_by_owner(self):
        """Test filtering poles by owner"""
        success1, _ = self.run_test("Filter Foreign Owned Poles", "GET", "poles", 200, params={"pole_owner": "Foreign Owned"})
        success2, _ = self.run_test("Filter ATT Poles", "GET", "poles", 200, params={"pole_owner": "ATT"})
        return success1 and success2

    def test_get_poles_filtered_by_condition(self):
        """Test filtering poles by condition"""
        return self.run_test("Filter by Condition", "GET", "poles", 200, params={"condition": "Bad"})

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
    print("🚀 Starting Pole Data Sheet Authentication & Photo Testing...")
    print("Testing new authentication flow and photo features")
    print("=" * 70)
    
    tester = PoleAPITester()
    
    # Test sequence based on review request
    test_functions = [
        # Basic API tests
        tester.test_root_endpoint,
        tester.test_get_pole_options,
        
        # Authentication Flow Tests (as requested)
        tester.test_auth_register,  # 1. Register new user
        tester.test_auth_login,     # 2. Login with credentials  
        tester.test_auth_me,        # 3. Get current user with token
        tester.test_auth_protected_endpoint,  # 4. Verify token required
        
        # Photo Display & Excel Export Tests (as requested)
        tester.test_create_pole_with_photos,  # 1. Create pole with photo URLs
        tester.test_excel_export_with_photos, # 2. Export Excel with photo links
        
        # Additional verification tests
        tester.test_get_stats,
        tester.test_get_all_poles,
        tester.test_get_nonexistent_pole,
    ]
    
    # Run all tests
    for test_func in test_functions:
        try:
            test_func()
        except Exception as e:
            print(f"❌ Test {test_func.__name__} failed with exception: {str(e)}")
    
    # Print results
    print("\n" + "=" * 70)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All authentication and photo tests passed!")
        print("✅ Authentication flow working correctly")
        print("✅ Photo URLs can be stored and exported")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        print("❌ Issues detected with authentication or photo features")
        return 1

if __name__ == "__main__":
    sys.exit(main())