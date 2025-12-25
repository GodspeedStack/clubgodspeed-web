import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import ProductCard from '../../components/store/ProductCard';

/**
 * Store - Pro Shop Landing Page
 * 
 * Features:
 * - "New Drops" hero header
 * - CSS Grid layout (2 cols mobile, 4 cols desktop)
 * - Product filtering by category
 * - Member-exclusive filtering
 */

export default function Store() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [showMemberOnly, setShowMemberOnly] = useState(false);

    useEffect(() => {
        loadProducts();
    }, []);

    const loadProducts = async () => {
        try {
            setLoading(true);

            const { data, error } = await supabase
                .from('products')
                .select(`
                    *,
                    variants:product_variants(*)
                `)
                .eq('status', 'active')
                .order('created_at', { ascending: false });

            if (error) throw error;

            setProducts(data || []);
        } catch (err) {
            console.error('Error loading products:', err);
        } finally {
            setLoading(false);
        }
    };

    // Filter products
    const filteredProducts = products.filter(product => {
        if (selectedCategory !== 'all' && product.category !== selectedCategory) {
            return false;
        }
        if (showMemberOnly && !product.is_member_exclusive) {
            return false;
        }
        return true;
    });

    // Get unique categories
    const categories = ['all', ...new Set(products.map(p => p.category).filter(Boolean))];

    return (
        <div style={styles.container}>
            {/* Hero Section - "New Drops" */}
            <div style={styles.hero}>
                <div style={styles.heroContent}>
                    <h1 style={styles.heroTitle}>NEW DROPS</h1>
                    <p style={styles.heroSubtitle}>
                        Premium gear for elite athletes. Limited quantities available.
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div style={styles.filters}>
                {/* Category Filter */}
                <div style={styles.filterGroup}>
                    {categories.map(category => (
                        <button
                            key={category}
                            onClick={() => setSelectedCategory(category)}
                            style={{
                                ...styles.filterButton,
                                ...(selectedCategory === category ? styles.filterButtonActive : {})
                            }}
                        >
                            {category === 'all' ? 'ALL' : category.toUpperCase()}
                        </button>
                    ))}
                </div>

                {/* Member Exclusive Toggle */}
                <label style={styles.toggleLabel}>
                    <input
                        type="checkbox"
                        checked={showMemberOnly}
                        onChange={(e) => setShowMemberOnly(e.target.checked)}
                        style={styles.checkbox}
                    />
                    <span style={styles.toggleText}>MEMBERS ONLY</span>
                </label>
            </div>

            {/* Product Grid */}
            {loading ? (
                <div style={styles.loading}>
                    <div style={styles.spinner}></div>
                    <p style={styles.loadingText}>Loading products...</p>
                </div>
            ) : filteredProducts.length === 0 ? (
                <div style={styles.empty}>
                    <p style={styles.emptyText}>No products found</p>
                </div>
            ) : (
                <div style={styles.grid}>
                    {filteredProducts.map(product => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            )}
        </div>
    );
}

// Styles
const styles = {
    container: {
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        paddingTop: '80px' // Account for fixed navbar
    },
    hero: {
        backgroundColor: '#000000',
        color: '#ffffff',
        padding: '80px 5%',
        textAlign: 'center'
    },
    heroContent: {
        maxWidth: '800px',
        margin: '0 auto'
    },
    heroTitle: {
        fontSize: '4rem',
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: '-0.02em',
        margin: '0 0 16px 0',
        lineHeight: '1'
    },
    heroSubtitle: {
        fontSize: '1.1rem',
        fontWeight: '400',
        color: '#999999',
        margin: 0,
        letterSpacing: '0.02em'
    },
    filters: {
        padding: '40px 5%',
        borderBottom: '1px solid #e5e5e5',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px'
    },
    filterGroup: {
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap'
    },
    filterButton: {
        backgroundColor: 'transparent',
        color: '#999999',
        border: 'none',
        padding: '8px 16px',
        fontSize: '12px',
        fontWeight: '700',
        letterSpacing: '0.1em',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontFamily: 'Inter, sans-serif'
    },
    filterButtonActive: {
        color: '#000000',
        borderBottom: '2px solid #000000'
    },
    toggleLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer'
    },
    checkbox: {
        width: '16px',
        height: '16px',
        cursor: 'pointer'
    },
    toggleText: {
        fontSize: '12px',
        fontWeight: '700',
        color: '#000000',
        letterSpacing: '0.1em'
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)', // 2 columns on mobile
        gap: '1px',
        padding: '0',
        backgroundColor: '#e5e5e5' // Grid line color
    },
    loading: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '100px 20px',
        gap: '20px'
    },
    spinner: {
        width: '40px',
        height: '40px',
        border: '3px solid #e5e5e5',
        borderTop: '3px solid #000000',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
    },
    loadingText: {
        fontSize: '14px',
        color: '#999999',
        letterSpacing: '0.05em'
    },
    empty: {
        padding: '100px 20px',
        textAlign: 'center'
    },
    emptyText: {
        fontSize: '14px',
        color: '#999999',
        letterSpacing: '0.05em'
    }
};

// Add CSS for responsive grid and animations
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @media (min-width: 768px) {
        .store-grid {
            grid-template-columns: repeat(4, 1fr) !important;
        }
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
`;
document.head.appendChild(styleSheet);
