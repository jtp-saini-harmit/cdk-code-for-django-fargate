-- Insert Categories
INSERT INTO products_category (name, description, created_at, updated_at) VALUES
('Electronics', 'Electronic devices and gadgets', NOW(), NOW()),
('Clothing', 'Fashion apparel and accessories', NOW(), NOW()),
('Books', 'Books and educational materials', NOW(), NOW()),
('Home & Garden', 'Home decor and gardening items', NOW(), NOW()),
('Sports', 'Sports equipment and accessories', NOW(), NOW());

-- Insert Products
INSERT INTO products_product (name, description, price, stock, category_id, created_at, updated_at) VALUES
('Smartphone X', 'Latest smartphone with advanced features', 699.99, 50, (SELECT id FROM products_category WHERE name = 'Electronics'), NOW(), NOW()),
('Laptop Pro', 'High-performance laptop for professionals', 1299.99, 25, (SELECT id FROM products_category WHERE name = 'Electronics'), NOW(), NOW()),
('Classic T-Shirt', 'Comfortable cotton t-shirt', 19.99, 100, (SELECT id FROM products_category WHERE name = 'Clothing'), NOW(), NOW()),
('Denim Jeans', 'Classic blue denim jeans', 49.99, 75, (SELECT id FROM products_category WHERE name = 'Clothing'), NOW(), NOW()),
('Python Programming', 'Comprehensive guide to Python', 39.99, 30, (SELECT id FROM products_category WHERE name = 'Books'), NOW(), NOW()),
('Garden Tools Set', 'Complete set of gardening tools', 89.99, 20, (SELECT id FROM products_category WHERE name = 'Home & Garden'), NOW(), NOW()),
('Basketball', 'Professional basketball', 29.99, 40, (SELECT id FROM products_category WHERE name = 'Sports'), NOW(), NOW());

-- Insert Customers
INSERT INTO products_customer (name, email, phone, address, created_at, updated_at) VALUES
('John Doe', 'john@example.com', '123-456-7890', '123 Main St, City', NOW(), NOW()),
('Jane Smith', 'jane@example.com', '987-654-3210', '456 Oak Ave, Town', NOW(), NOW()),
('Bob Johnson', 'bob@example.com', '555-555-5555', '789 Pine Rd, Village', NOW(), NOW());

-- Insert Sales and Sale Items
DO $$
DECLARE
    v_customer_id integer;
    v_sale_id integer;
    v_product_id integer;
    v_product_price decimal;
    v_quantity integer;
    v_total_amount decimal;
    v_status text;
BEGIN
    -- Create 20 random sales
    FOR i IN 1..20 LOOP
        -- Get random customer
        SELECT id INTO v_customer_id FROM products_customer ORDER BY RANDOM() LIMIT 1;
        
        -- Initialize sale total
        v_total_amount := 0;
        
        -- Random status
        v_status := (ARRAY['completed', 'pending', 'cancelled'])[floor(random() * 3 + 1)];
        
        -- Create sale
        INSERT INTO products_sale (customer_id, status, sale_date, total_amount, created_at, updated_at)
        VALUES (v_customer_id, v_status, 
                NOW() - (random() * interval '30 days'),
                0, NOW(), NOW())
        RETURNING id INTO v_sale_id;
        
        -- Add 1-5 random products to the sale
        FOR j IN 1..floor(random() * 5 + 1) LOOP
            -- Get random product and its price
            SELECT id, price INTO v_product_id, v_product_price 
            FROM products_product ORDER BY RANDOM() LIMIT 1;
            
            -- Random quantity between 1 and 3
            v_quantity := floor(random() * 3 + 1);
            
            -- Create sale item
            INSERT INTO products_saleitem (sale_id, product_id, quantity, unit_price, total_price)
            VALUES (v_sale_id, v_product_id, v_quantity, v_product_price, v_product_price * v_quantity);
            
            -- Update sale total
            v_total_amount := v_total_amount + (v_product_price * v_quantity);
        END LOOP;
        
        -- Update sale total amount
        UPDATE products_sale SET total_amount = v_total_amount WHERE id = v_sale_id;
    END LOOP;
END $$;

-- Update product stock based on sales
UPDATE products_product p
SET stock = p.stock - COALESCE(
    (SELECT SUM(si.quantity)
     FROM products_saleitem si
     WHERE si.product_id = p.id), 0);

-- Verify data
SELECT 'Categories' as type, COUNT(*) as count FROM products_category
UNION ALL
SELECT 'Products', COUNT(*) FROM products_product
UNION ALL
SELECT 'Customers', COUNT(*) FROM products_customer
UNION ALL
SELECT 'Sales', COUNT(*) FROM products_sale
UNION ALL
SELECT 'Sale Items', COUNT(*) FROM products_saleitem;

-- Show some sample data
SELECT 
    s.id as sale_id,
    c.name as customer_name,
    s.sale_date,
    s.total_amount,
    s.status,
    COUNT(si.id) as num_items
FROM products_sale s
JOIN products_customer c ON s.customer_id = c.id
JOIN products_saleitem si ON s.id = si.sale_id
GROUP BY s.id, c.name, s.sale_date, s.total_amount, s.status
ORDER BY s.sale_date DESC
LIMIT 5;
