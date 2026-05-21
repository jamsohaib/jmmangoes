import { useState } from 'react';

const ProductCard = ({ product }) => {
  const [quantity, setQuantity] = useState(1);

  const handleAddToCart = () => {
    // Implement your add to cart logic here
    console.log('Adding to cart:', product, 'Quantity:', quantity);
  };

  return (
    <div className="product-card">
      {/* Product details */}
      <div className="quantity-selector">
        <button onClick={() => setQuantity(prev => Math.max(prev - 1, 1))}>-</button>
        <span>{quantity}</span>
        <button onClick={() => setQuantity(prev => prev + 1)}>+</button>
      </div>
      <button onClick={handleAddToCart}>Add to Cart</button>
    </div>
  );
};
