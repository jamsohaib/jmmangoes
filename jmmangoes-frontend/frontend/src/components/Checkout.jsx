// src/components/Checkout.jsx
import { useState, useEffect } from 'react';
import useCartStore from '../store/cartStore';
import api from '../lib/api';
import DEFAULT_CITIES from '../constants/defaultCities';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';


function Checkout() {
  const navigate = useNavigate();
  const { cart, totalItems, incrementQuantity, decrementQuantity, clearCart } = useCartStore();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    address: '',
    city: '',
    postalCode: '',
    otherCity:'',
    mobile:'',
  });


  // const [unitShipping, setUnitShipping] = useState(0)
  // const itemsCount = totalItems();
  // const [shippingCost, setShippingCost] = useState(0);
  // const [totalCost, setTotalCost] = useState(0);

  const [settings, setSettings] = useState({ zoneAUnitCost: 0, cityOverrides: [], allowedCities: [] });
  const [unitShipping, setUnitShipping] = useState(0);
  const itemsCount = totalItems();
  
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingCost = unitShipping * itemsCount;
  const totalCost = subtotal + shippingCost;

   const [otherFiled, setOtherFiled] = useState(false);

    // Fetch admin shipping settings once on component mount
  useEffect(() => {
    api.get('/shippingCosts/public')
      .then(res => setSettings(res.data || { zoneAUnitCost: 0, cityOverrides: [], allowedCities: [] }))
      .catch(err => console.error('Error loading shipping settings:', err));
  }, []);

  const availableCities = settings.allowedCities?.length ? settings.allowedCities : DEFAULT_CITIES;
  
  // Recompute shipping rates whenever city input, settings, or cart changes
  useEffect(() => {
    const city = formData.city.trim().toLowerCase();
    const override = settings.cityOverrides?.find(o => o.city.toLowerCase() === city);
    setUnitShipping(override ? override.cost : settings.zoneAUnitCost);
  }, [formData.city, settings]);

   const handleChange = e => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if(e.target.name==='city'){
      if(e.target.value==='Other'){
            setOtherFiled(true);
        }
        else{
            setOtherFiled(false);

        }

    }
     
   }
  
   async function handleSubmit(e) {
    e.preventDefault();
    console.log('Checkout data:', formData);
    console.log('Cart items:', cart);
    console.log('Shipping rate per item:', unitShipping);
    console.log('Shipping cost total:', shippingCost);
    console.log('Total cost:', totalCost);

    try {
      const res = await api.post('/checkout', {
          customer: formData,
          items: cart.map(i => ({
            productId: i._id,
            name: i.name,
            price: i.price,
            quantity: i.quantity
          }))
        });
      clearCart();
      toast.success('Order placed successfully.');
      navigate('/order-success', { state: { orderNumber: res?.data?.orderNumber || '' } });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to place order. Please try again.');
    }
  };


  


  // useEffect(() => {
  //   // Calculate shipping cost based on city
  //   const city = formData.city.trim().toLowerCase();
  //   const shipping = city === 'lahore' ? 100 : 200;
  //   setShippingCost(shipping);

  //    // Totals
  //   const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  //   setShippingCost(perItem * itemsCount)
  //   setTotalCost(subtotal + perItem * itemsCount)

  //   // Calculate total cost
  //   // const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  //   // setTotalCost(subtotal + shipping);
  // }, [formData.city, cart, itemsCount]);

  //  useEffect(() => {
  //   // Determine unit cost by city:
  //   const city = formData.city.trim().toLowerCase()
  //   const perItem = city === 'lahore' ? 50 : 370
  //   setUnitShipping(perItem)

  //   // Totals
  // const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  //   setShippingCost(perItem * itemsCount)
  //   setTotalCost(subtotal + perItem * itemsCount)
  // }, [formData.city, cart, itemsCount])

  // const handleChange = (e) => {
  //   setFormData({ ...formData, [e.target.name]: e.target.value });
  // };

  // const handleSubmit = (e) => {
  //   e.preventDefault();
  //   // Implement checkout logic here (e.g., send data to backend)
  //   console.log('Checkout data:', formData);
  //   console.log('Cart items:', cart);
  //   console.log('Total cost:', totalCost);
  //   // After successful checkout
  //   clearCart();
  // };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 bg-white shadow-md mt-6 md:mt-10">
      <h2 className="text-2xl font-bold mb-6 text-green-700">Checkout</h2>

   

       {/* Cart & Shipping Summary */}
    <div className="mb-6 text-green-700">
      <h3 className="text-xl font-semibold mb-4">Order Summary</h3>
      <ul>
        {cart.map(item => (
          <li key={item._id} className="flex flex-col md:flex-row md:justify-between md:items-center gap-2 mb-3">
            <div>
              <span>{item.name}</span>
              <div className="flex items-center mt-2">
                <button onClick={() => decrementQuantity(item._id)} className="bg-gray-200 px-2 py-1 rounded-l">-</button>
                <span className="px-4">{item.quantity}</span>
                <button onClick={() => incrementQuantity(item._id)} className="bg-gray-200 px-2 py-1 rounded-r">+</button>
              </div>
            </div>
            <span>PKR {item.price * item.quantity}</span>
          </li>
        ))}
      </ul>

      <div className="flex justify-between gap-3 mt-4 text-sm md:text-base">
        <span>Unit Shipping Rate for {formData.city===''?"Standard (May Update with City selection)": formData.city} : </span> <span>PKR {unitShipping.toFixed(2)}</span>
      </div>
      <div className="flex justify-between gap-3 text-sm md:text-base">
        <span>Shipping (×{itemsCount} items):</span> <span>PKR {shippingCost.toFixed(2)}</span>
      </div>
      <div className="flex justify-between gap-3 font-bold mt-2 text-sm md:text-base">
        <span>Total:</span> <span>PKR {totalCost.toFixed(2)}</span>
      </div>
    </div>

      {/* Checkout Form */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 text-black">
        <div>
          <label className="block mb-2 text-sm font-medium text-gray-700">Full Name</label>
          <input
            type="text"
            name="name"
            className="w-full border border-gray-300 p-2 rounded"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label className="block mb-2 text-sm font-medium text-gray-700">Email (To get updates of order placement)</label>
          <input
            type="email"
            name="email"
            className="w-full border border-gray-300 p-2 rounded"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>
        <div className="md:col-span-2">
          <label className="block mb-2 text-sm font-medium text-gray-700">Address</label>
          <input
            type="text"
            name="address"
            className="w-full border border-gray-300 p-2 rounded"
            value={formData.address}
            onChange={handleChange}
            required
          />
        </div>
        {/* <div>
          <label className="block mb-2 text-sm font-medium text-gray-700">City</label>
          <input
            type="text"
            name="city"
            className="w-full border border-gray-300 p-2 rounded"
            value={formData.city}
            onChange={handleChange}
            required
          />
        </div> */}
         <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">City</label>
              <div className="relative">
                <select
                  name="city"
                  id="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded px-3 py-3 text-base bg-white appearance-none pr-10"
                >
                  <option value="">Select City</option>
                  {availableCities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500" aria-hidden="true">▾</span>
              </div>
             
          </div>
            {otherFiled && (

                        <div>

                           <label className="block mb-2 text-sm font-medium text-gray-700">Other City</label>
           


                            {/* <label
                                htmlFor="District"
                                className="block text-xl font-medium text-gray-700 undefined "
                            >
                                District
                            </label>  */}
                            <div className="flex flex-col items-start">
                                <input
                                    type="text"
                                    id="otherCity"
                                    name="otherCity"
                                    className=" w-full border border-gray-300 p-2 rounded"
                                    value={formData.otherCity}
                                    onChange={handleChange}
                                    // ref={tehsilRef} 
                                    placeholder="Enter City Name "
                                
                                />
                            </div>
                        </div>

                            )}
      
         <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">Mobile Number (Preferable WhatsApp)</label>
            
          
              <input
                  type="text"
                  name="mobile"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={formData.mobile}
                  onChange={handleChange}
                  placeholder="Enter Mobile Number Preferably (WhatsApp)"
                  required
              />
      
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            className="w-full bg-green-600 text-white p-3 rounded hover:bg-green-700 transition"
          >
            Place Order
          </button>
        </div>
      </form>
    </div>
  );
}

export default Checkout;
