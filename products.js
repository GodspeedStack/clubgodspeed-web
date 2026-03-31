/**
 * Godspeed Store - Unified Product Catalog
 * Single source of truth for all product data across store, product detail, and cart pages.
 * Prices are in USD dollars (not cents).
 */

(function () {
    'use strict';

    const PRODUCTS = [
        {
            id: 'godspeed-hoodie',
            title: 'Godspeed Essentials Hoodie',
            price: 65.00,
            image: 'assets/godspeed-hoodie.png',
            images: ['assets/godspeed-hoodie.png'],
            category: 'apparel',
            tag: 'Best Seller',
            tagColor: '#2563eb',
            description: 'Premium heavyweight cotton hoodie for court and street. Perfect for training, games, or everyday wear.',
            features: [
                '80% Cotton, 20% Polyester',
                'Kangaroo pocket',
                'Drawstring hood',
                'Relaxed fit',
                'Godspeed embroidered logo'
            ],
            sizes: ['S', 'M', 'L', 'XL', 'XXL'],
            availableSizes: ['S', 'M', 'L', 'XL'],
            inStock: true
        },
        {
            id: 'godspeed-tshirt',
            title: 'Godspeed Logo Tee',
            price: 30.00,
            image: 'assets/godspeed-tshirt.png',
            images: ['assets/godspeed-tshirt.png'],
            category: 'apparel',
            tag: null,
            tagColor: null,
            description: 'Classic fit cotton tee with signature Godspeed branding. Essential for every player\'s wardrobe.',
            features: [
                '100% Cotton',
                'Classic fit',
                'Screen-printed logo',
                'Machine washable',
                'Pre-shrunk'
            ],
            sizes: ['S', 'M', 'L', 'XL', 'XXL'],
            availableSizes: ['S', 'M', 'L', 'XL', 'XXL'],
            inStock: true
        },
        {
            id: 'godspeed-shorts-black',
            title: 'Godspeed Elite Shorts',
            price: 45.00,
            image: 'assets/godspeed-shorts.png',
            images: ['assets/godspeed-shorts.png'],
            category: 'apparel',
            tag: null,
            tagColor: null,
            description: 'High-performance basketball shorts with sweat-wicking technology. Designed for elite athletes who demand the best in comfort and performance.',
            features: [
                'Moisture-wicking fabric',
                'Elastic waistband with drawstring',
                'Deep side pockets',
                'Athletic fit',
                '7-inch inseam'
            ],
            sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
            availableSizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
            inStock: true
        },
        {
            id: 'godspeed-croptop',
            title: 'Women\'s Performance Crop',
            price: 35.00,
            image: 'assets/godspeed-croptop.png',
            images: ['assets/godspeed-croptop.png'],
            category: 'apparel',
            tag: null,
            tagColor: null,
            description: 'Athletic fit crop top designed for high-intensity training. Breathable fabric keeps you cool during the toughest workouts.',
            features: [
                'Breathable performance fabric',
                'Racerback design',
                'Moisture-wicking',
                'Athletic fit',
                'Flatlock seams'
            ],
            sizes: ['XS', 'S', 'M', 'L', 'XL'],
            availableSizes: ['XS', 'S', 'M', 'L', 'XL'],
            inStock: true
        },
        {
            id: 'godspeed-socks',
            title: 'Performance Crew Socks',
            price: 15.00,
            image: 'assets/godspeed-socks.png',
            images: ['assets/godspeed-socks.png'],
            category: 'accessories',
            tag: null,
            tagColor: null,
            description: 'Cushioned performance socks with arch support. Keep your feet comfortable during long training sessions.',
            features: [
                'Cushioned sole',
                'Arch support',
                'Moisture-wicking',
                'Reinforced heel and toe',
                'One size fits most'
            ],
            sizes: ['One Size'],
            availableSizes: ['One Size'],
            inStock: true
        },
        {
            id: 'nike-ja-3',
            title: 'Nike Ja 3 "Day One"',
            price: 120.00,
            image: 'assets/nike-ja-3.png',
            images: ['assets/nike-ja-3.png'],
            category: 'footwear',
            tag: 'Limited',
            tagColor: '#ef4444',
            description: 'The Ja 3 is built for speed and agility on the court. Lightweight cushioning and a lockdown fit make this the go-to for guards who play fast.',
            features: [
                'Zoom Air cushioning',
                'Engineered mesh upper',
                'Herringbone traction pattern',
                'Lightweight construction',
                'Signature Ja Morant branding'
            ],
            sizes: ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13'],
            availableSizes: ['7', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12'],
            inStock: true
        },
        {
            id: 'anta-kai-1',
            title: 'Anta Kai 1 "Crown Jewel"',
            price: 140.00,
            image: 'assets/anta-kai-1.png',
            images: ['assets/anta-kai-1.png'],
            category: 'footwear',
            tag: 'Import',
            tagColor: '#111',
            description: 'Kyrie Irving\'s signature shoe delivers elite court feel with Anta\'s Nitrogen Speed technology. Premium materials and a unique colorway make this a collector\'s item.',
            features: [
                'Nitrogen Speed cushioning',
                'Full-length carbon fiber plate',
                'Premium leather overlays',
                'Multi-directional traction',
                'Kyrie Irving signature'
            ],
            sizes: ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13'],
            availableSizes: ['7.5', '8', '9', '9.5', '10', '11', '12'],
            inStock: true
        },
        {
            id: 'nb-two-wxy-v5',
            title: 'New Balance TWO WXY v5',
            price: 120.00,
            image: 'assets/nb-two-wxy.png',
            images: ['assets/nb-two-wxy.png'],
            category: 'footwear',
            tag: null,
            tagColor: null,
            description: 'New Balance\'s premier basketball shoe combines FuelCell cushioning with a supportive upper for all-around performance on the court.',
            features: [
                'FuelCell midsole cushioning',
                'Synthetic and mesh upper',
                'Herringbone outsole pattern',
                'Midfoot support shank',
                'Padded collar and tongue'
            ],
            sizes: ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13'],
            availableSizes: ['7', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12', '13'],
            inStock: true
        }
    ];

    // Category definitions
    const CATEGORIES = [
        { id: 'all', label: 'All' },
        { id: 'apparel', label: 'Apparel' },
        { id: 'footwear', label: 'Footwear' },
        { id: 'accessories', label: 'Accessories' }
    ];

    // Build lookup map
    const PRODUCT_MAP = {};
    PRODUCTS.forEach(function (p) { PRODUCT_MAP[p.id] = p; });

    /**
     * Get all products, optionally filtered by category.
     * @param {string} [category='all']
     * @returns {Array}
     */
    function getProducts(category) {
        if (!category || category === 'all') return PRODUCTS.slice();
        return PRODUCTS.filter(function (p) { return p.category === category; });
    }

    /**
     * Get a single product by ID.
     * @param {string} id
     * @returns {Object|null}
     */
    function getProduct(id) {
        return PRODUCT_MAP[id] || null;
    }

    /**
     * Get all categories.
     * @returns {Array}
     */
    function getCategories() {
        return CATEGORIES.slice();
    }

    // Expose API
    window.GodspeedCatalog = {
        getProducts: getProducts,
        getProduct: getProduct,
        getCategories: getCategories,
        PRODUCTS: PRODUCTS,
        CATEGORIES: CATEGORIES
    };
})();
