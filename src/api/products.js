export default {
  route: '/api/products',
  handler: (req, res) => {
    const products = [
      { id: 1, name: 'Product A', price: 100 },
      { id: 2, name: 'Product B', price: 200 },
    ];

    // Handle filtering through query parameters
    const { minPrice, maxPrice } = req.query;

    let filteredProducts = products;

    if (minPrice) {
      filteredProducts = filteredProducts.filter(p => p.price >= parseFloat(minPrice));
    }

    if (maxPrice) {
      filteredProducts = filteredProducts.filter(p => p.price <= parseFloat(maxPrice));
    }

    res.json(filteredProducts);
  }
};
