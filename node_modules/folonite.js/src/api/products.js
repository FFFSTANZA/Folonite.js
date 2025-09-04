export function getProducts(req, res) {
    // Simulate fetching products from a database
    const products = [
      { id: 1, name: 'Product 1', price: 100 },
      { id: 2, name: 'Product 2', price: 200 },
    ];
    res.json(products);
  }
  
  export function createProduct(req, res) {
    const { name, price } = req.body;
    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }
  
    // Simulate saving the new product (e.g., to a database)
    const newProduct = { id: Date.now(), name, price };
    res.status(201).json(newProduct);
  }
  