export default {
    route: '/api/orders',
    handler: (req, res) => {
      if (req.method === 'GET') {
        // Simulate fetching orders
        const orders = [
          { id: 1, customer: 'Alice', total: 250 },
          { id: 2, customer: 'Bob', total: 400 },
        ];
        res.json(orders);
      } else if (req.method === 'POST') {
        // Handle order creation
        const { customer, total } = req.body;
        if (!customer || !total) {
          res.status(400).json({ error: 'Customer name and total amount are required.' });
        } else {
          const newOrder = { id: Date.now(), customer, total };
          res.status(201).json(newOrder); // Simulate order creation
        }
      } else {
        res.status(405).json({ error: 'Method Not Allowed' });
      }
    }
  };
  