-- Fix orders_id_seq if it's behind actual max id in orders table
SELECT setval('orders_id_seq', (SELECT MAX(id) FROM orders), true);
