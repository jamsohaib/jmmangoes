// src/components/Cart.jsx
function Cart() {
  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 bg-white shadow-md mt-6 md:mt-10">
      <h2 className="text-2xl font-bold mb-6 text-green-700">Your Cart</h2>
      {/* Display cart items here */}
      <p>Your cart is currently empty.</p>
    </div>
  );
}

export default Cart;
