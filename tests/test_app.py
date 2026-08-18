import unittest

from app import app


class GlobeTrotterApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_services_endpoint_returns_service_cards(self):
        response = self.client.get('/api/services')
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIsInstance(payload, list)
        self.assertTrue(payload)

        first_service = payload[0]
        self.assertIn('id', first_service)
        self.assertIn('title', first_service)
        self.assertIn('description', first_service)
        self.assertIn('destinations', first_service)

    def test_food_destinations_include_exact_addresses(self):
        response = self.client.get('/api/destinations?category=food')
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload)

        first_destination = payload[0]
        self.assertIn('address', first_destination)
        self.assertTrue(first_destination['address'])

    def test_bamenda_view_page_is_served(self):
        response = self.client.get('/view')
        self.assertEqual(response.status_code, 200)
        self.assertIn('Bamenda', response.get_data(as_text=True))

    def test_destinations_are_scoped_to_bamenda_northwest(self):
        response = self.client.get('/api/destinations')
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload)
        allowed_terms = ['bamenda', 'mile 4', 'mile 3', 'mile 2', 'foncha', 'new road', 'center bolt', 'nkwen', 'city centre', 'central bamenda', 'up station', 'commercial avenue', 'sonac', 'old town']
        self.assertTrue(all(any(term in ' '.join([
            item.get('name', ''),
            item.get('location', ''),
            item.get('address', ''),
            ' '.join(item.get('tags', [])),
        ]).lower() for term in allowed_terms) for item in payload))

    def test_destinations_include_attributed_images(self):
        response = self.client.get('/api/destinations')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(item.get('image') and item.get('imageCredit') for item in response.get_json()))


if __name__ == '__main__':
    unittest.main()
