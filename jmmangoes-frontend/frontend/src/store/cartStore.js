// src/store/cartStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// const useCartStore = create((set, get) => ({
const useCartStore = create(persist(
  (set, get) => ({
  cart: [],
  addToCart: (product, quantity = 1) => {
    const existingItem = get().cart.find(item => item._id === product._id);
    if (existingItem) {
      set({
        cart: get().cart.map(item =>
          item._id === product._id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        ),
      });
    } else {
      set({ cart: [...get().cart, { ...product, quantity }] });
    }
  },
  removeFromCart: (productId) => {
    set({ cart: get().cart.filter(item => item._id !== productId) });
  },
  incrementQuantity: (productId) => {
    set({
      cart: get().cart.map(item =>
        item._id === productId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ),
    });
  },
  decrementQuantity: (productId) => {
    const item = get().cart.find(item => item._id === productId);
    if (item) {
      if (item.quantity > 1) {
        set({
          cart: get().cart.map(item =>
            item._id === productId
              ? { ...item, quantity: item.quantity - 1 }
              : item
          ),
        });
      } else {
        // Remove item if quantity is 1
        set({ cart: get().cart.filter(item => item._id !== productId) });
      }
    }
  },
  clearCart: () => set({ cart: [] }),
  totalItems: () => get().cart.reduce((sum, i) => sum + i.quantity, 0),
// }));
 }),
  {
    name: 'cart-storage', // name of the item in storage
  }
));

export default useCartStore;
