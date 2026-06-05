import React from 'react';
import { Link } from 'react-router-dom';

const PrivacyPolicy = () => {
  return (
    <div className="bg-white text-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-green-800 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-600 mb-8">Last updated: June 5, 2026</p>

        <div className="space-y-6 leading-7">
          <section>
            <h2 className="text-xl font-semibold text-green-800 mb-2">Who We Are</h2>
            <p>
              JM Mangoes operates the website jmmangoes.pk and related customer communication channels for order
              placement, order support, delivery updates, and customer service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-green-800 mb-2">Information We Collect</h2>
            <p>
              We may collect customer name, phone number, email address, delivery address, city, order details,
              payment method information, payment receipt uploads where applicable, customer queries, feedback,
              and communication records related to orders and support.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-green-800 mb-2">How We Use Information</h2>
            <p>
              We use customer information to process orders, confirm orders, arrange delivery, send courier or
              tracking updates, handle payment verification, respond to customer queries, improve service quality,
              and maintain business records.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-green-800 mb-2">WhatsApp Communications</h2>
            <p>
              If you provide your WhatsApp number or contact us through WhatsApp, we may use WhatsApp Business
              Platform to send order confirmations, delivery updates, payment-related updates, and support
              messages. Customers may reply to these messages for order support. WhatsApp communications are also
              subject to WhatsApp and Meta privacy practices.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-green-800 mb-2">Sharing Information</h2>
            <p>
              We do not sell customer personal information. We may share necessary order and delivery information
              with courier partners, payment or communication service providers, and internal staff responsible for
              fulfilling orders and providing support.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-green-800 mb-2">Data Security</h2>
            <p>
              We use reasonable administrative and technical safeguards to protect customer information. Access to
              order and customer data is limited to authorized users based on business roles and responsibilities.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-green-800 mb-2">Data Retention</h2>
            <p>
              We retain order, payment, communication, and business records for as long as needed to provide
              services, resolve disputes, comply with legal or accounting requirements, and support business
              operations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-green-800 mb-2">Your Choices</h2>
            <p>
              You may contact us to update your information, ask questions about your data, or request that we stop
              sending non-essential communications. Transactional order and delivery messages may still be required
              to complete active orders.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-green-800 mb-2">Contact Us</h2>
            <p>
              For privacy questions or data requests, contact us at{' '}
              <a className="text-green-700 underline" href="mailto:info@csittec.com">info@csittec.com</a>.
            </p>
          </section>
        </div>

        <div className="mt-10">
          <Link to="/" className="inline-flex items-center rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
