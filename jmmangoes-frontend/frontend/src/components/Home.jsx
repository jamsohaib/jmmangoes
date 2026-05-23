// src/components/Home.jsx

import React, { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import api from '../lib/api';

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import useCartStore from '../store/cartStore';


const Home = () => {
  const [products, setProducts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const pricingRef = useRef(null);
   const location = useLocation();

   const { addToCart } = useCartStore();


  // useEffect(() => {
  //   axios.get('http://localhost:5000/api/getProductsForPublic')
  //     .then((res) => setProducts(res.data))
  //        .catch(() => {});
  // }, []);

    useEffect(() => {
      api.get('/getProductsForPublic')
        .then((productsRes) => {
          setProducts(productsRes.data);
          const initialQuantities = {};
          productsRes.data.forEach((product) => {
            initialQuantities[product._id] = 1;
          });
          setQuantities(initialQuantities);
        })
        .catch(() => {});
    }, []);

  const getDisplayPrice = (product) => product.price;

  useEffect(() => {
    if (location.state?.scrollTo) {
      const section = document.getElementById(location.state.scrollTo);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [location]);

    const handleAddToCart = (product) => {
        if (product.isAvailableForCart === false) {
          toast.warn(`${product.name} is currently unavailable.`);
          return;
        }
        const quantity = quantities[product._id] || 1;
        const displayPrice = getDisplayPrice(product);
        // Implement your add to cart logic here, e.g., update cart context or state
        console.log(`Adding ${quantity} of ${product.name} to cart`);
         addToCart({ ...product, price: displayPrice }, quantity);

        
      // Show toast notification
      // toast.success(`${quantity} x ${product.name} added to cart!`);

       toast.success(
          <span>
            {quantity} × <strong>{product.name}</strong> added to cart. <Link to="/checkout" style={{ color: '#ffd700', textDecoration: 'underline' }}>Proceed to checkout</Link>
          </span>,
          {
            autoClose: 7000,
            // position: toast.POSITION.TOP_RIGHT,
          }
        );


        // Reset quantity to 1 after adding to cart
        setQuantities((prevQuantities) => ({
          ...prevQuantities,
          [product._id]: 1,
        }));
      };
      const handleScrollToPricing = () => {
        pricingRef.current?.scrollIntoView({ behavior: 'smooth' });
      };

  const handleQuantityChange = (productId, delta) => {
      setQuantities((prevQuantities) => {
        const newQuantity = (prevQuantities[productId] || 1) + delta;
        return {
          ...prevQuantities,
          [productId]: newQuantity > 0 ? newQuantity : 1,
        };
      });
    };


  return (
    <div className="bg-gradient-to-r from-gray-200 to-orange-100">
      <header className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-green-800 mb-4">
            Fresh Mangoes Delivered to Your Doorstep
          </h1>
          <p className="text-lg text-green-700 mb-6">
            Experience the taste of premium quality mangoes from JM Mangoes.
          </p>
          <a
            href="#pricing"
            className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 transition"
          >
            Shop Now
          </a>
         {/* <button
          onClick={handleScrollToPricing}
          className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 transition"
        >
          Shop Now
        </button> */}

        </div>
      </header>

      <section id="features" className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-semibold text-gray-800 mb-6">Why Choose Us</h2>
          <div className="flex flex-col md:flex-row justify-center items-center gap-8">
            <div className="max-w-sm">
              <h3 className="text-xl font-bold text-green-700 mb-2">Organic Farming</h3>
              <p className="text-gray-600">
                Our mangoes are grown without harmful chemicals, ensuring natural taste and health benefits.
              </p>
            </div>
            <div className="max-w-sm">
              <h3 className="text-xl font-bold text-green-700 mb-2">Fast Delivery</h3>
              <p className="text-gray-600">
                We ensure quick and safe delivery so you can enjoy fresh mangoes promptly.
              </p>
            </div>
            <div className="max-w-sm">
              <h3 className="text-xl font-bold text-green-700 mb-2">Quality Assurance</h3>
              <p className="text-gray-600">
                Each mango is handpicked and inspected to meet our high-quality standards.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* <section id="pricing" className="bg-green-50 py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-semibold text-gray-800 mb-6">Pricing Plans</h2>
          <div className="flex flex-col md:flex-row justify-center items-center gap-8">
            <div className="bg-white p-6 rounded shadow max-w-sm">
              <h3 className="text-xl font-bold text-green-700 mb-2">Basic</h3>
              <p className="text-gray-600 mb-4">5kg of fresh mangoes</p>
              <p className="text-2xl font-bold text-gray-800 mb-4">PKR 1,500</p>
              <a
                href="#order"
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
              >
                Order Now
              </a>
            </div>
            <div className="bg-white p-6 rounded shadow max-w-sm">
              <h3 className="text-xl font-bold text-green-700 mb-2">Premium</h3>
              <p className="text-gray-600 mb-4">10kg of fresh mangoes</p>
              <p className="text-2xl font-bold text-gray-800 mb-4">PKR 2,800</p>
              <a
                href="#order"
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
              >
                Order Now
              </a>
            </div>
          </div>
        </div>
      </section> */}

     <section id="pricing" ref={pricingRef} className="bg-green-50 py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-semibold text-gray-800 mb-6">Our Products</h2>
          <div className="flex flex-wrap justify-center gap-8">
            {products.map((product) => (
              <div key={product._id} className="bg-white p-6 rounded shadow w-full max-w-sm min-h-[520px] flex flex-col relative">
                {product.isAvailableForCart === false && (
                  <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded">
                    Unavailable
                  </div>
                )}
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-48 object-cover mb-4"
                />

                <h3 className="text-xl font-bold text-green-700 mb-2">{product.name}</h3>
                <p className="text-gray-600 mb-4 min-h-[72px]">{product.description}</p>
                <p className="text-2xl font-bold text-yellow-500 mb-4">PKR {getDisplayPrice(product)}</p>

                 {/* Quantity Selector */}
                <div className="flex items-center justify-center mb-4">
                  <button
                    onClick={() => handleQuantityChange(product._id, -1)}
                    className="bg-green-600 px-2 py-1 rounded-l cursor-pointer hover:bg-yellow-500 transition"
                  >
                    -
                  </button>
                  <span className="text-yellow-500 font-bold px-4">{quantities[product._id] || 1}</span>
                  <button
                    onClick={() => handleQuantityChange(product._id, 1)}
                    className="bg-green-600 px-2 py-1 rounded-r cursor-pointer hover:bg-yellow-500 transition"
                  >
                    +
                  </button>
                </div>

                 {/* <div className="flex items-center mb-4">
                  <button onClick={() => handleQuantityChange(product._id, Math.max((quantities[product._id] || 1) - 1, 1))}  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition">-</button>
                  <span className="mx-2 text-black">{quantities[product._id] || 1}</span>
                  <button onClick={() => handleQuantityChange(product._id, (quantities[product._id] || 1) + 1)}  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition">+</button>
                </div> */}

                <button
                  onClick={() => handleAddToCart(product)}
                  disabled={product.isAvailableForCart === false}
                  className={`px-4 py-2 rounded transition cursor-pointer text-white ${
                    product.isAvailableForCart === false
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-yellow-500'
                  } mt-auto`}
                >
                  {product.isAvailableForCart === false ? 'Unavailable' : 'Add to Cart'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-semibold text-gray-800 mb-6">Get in Touch</h2>
          <p className="text-gray-600 mb-4">
            Have questions or need assistance? Reach out to us!
          </p>
          <a href="mailto:info@jmmangoes.pk" className="text-green-600 underline">
            info@jmmangoes.pk
          </a>
        </div>
      </section>
    </div>
  );
};

export default Home;
