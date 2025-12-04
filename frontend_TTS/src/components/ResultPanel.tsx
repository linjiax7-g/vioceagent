import React from 'react';

type ProductSource =
  | string
  | Array<{
      type?: string;
      label?: string;
      url?: string;
      docId?: string;
    }>;

interface Product {
  doc_id?: string;
  title?: string;
  price?: number | string | null;
  rating?: number | null;
  ratingCount?: number | null;
  brand?: string;
  material?: string;
  description?: string;
  snippet?: string;
  source?: ProductSource;
  url?: string;
  imageUrl?: string;
  image_url?: string;
  image?: string;
  thumbnail?: string;
  productUrl?: string;
  product_url?: string;
  cited?: boolean;  // Flag indicating if this product was referenced in the answer
}

interface ResultPanelProps {
  result: {
    products?: Product[];
    constraints?: Record<string, any>;
    task?: string;
    citations?: string[];
  } | null;
  isProcessing: boolean;
  onProductClick: (product: Product) => void;
}

const formatCurrency = (price: number | string | null | undefined) => {
  if (price === null || price === undefined) {
    return 'N/A';
  }

  let numericPrice: number | null = null;

  if (typeof price === 'number') {
    numericPrice = Number.isFinite(price) ? price : null;
  } else if (typeof price === 'string') {
    const match = price.match(/[\d,.]+/);
    if (match) {
      const parsed = parseFloat(match[0].replace(/,/g, ''));
      numericPrice = Number.isFinite(parsed) ? parsed : null;
    }
  }

  if (numericPrice === null) {
    return typeof price === 'string' && price.trim().length > 0 ? price : 'N/A';
  }

  const hasCents = Math.abs(numericPrice % 1) > 0;
  return numericPrice.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2
  });
};

const formatSourceLabel = (url?: string) => {
  if (!url) return '';

  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, '');
    return hostname || 'View product';
  } catch {
    const sanitized = url.replace(/^https?:\/\//i, '');
    return sanitized.split('/')[0] || 'View product';
  }
};

const getSourceDisplay = (product: Product) => {
  const sourceData = product.source;
  const defaultLabel = product.productUrl ? 'Online Source' : 'Catalog';

  if (Array.isArray(sourceData)) {
    const privateSource = sourceData.find((src) => src?.type === 'private');
    const webSource = sourceData.find((src) => src?.type === 'web');

    if (privateSource && webSource) {
      return { label: 'Hybrid (Catalog + Web)', badge: 'Hybrid', tone: '#7C3AED' };
    }
    if (privateSource) {
      return { label: 'Private Catalog', badge: 'Catalog', tone: '#0EA5E9' };
    }
    if (webSource) {
      return { label: 'Web Search', badge: 'Web', tone: '#EC4899' };
    }
  }

  if (typeof sourceData === 'string') {
    if (sourceData.toLowerCase().includes('web')) {
      return { label: 'Web Search', badge: 'Web', tone: '#EC4899' };
    }
    if (sourceData.toLowerCase().includes('rag')) {
      return { label: 'Private Catalog', badge: 'Catalog', tone: '#0EA5E9' };
    }
    return { label: sourceData, badge: sourceData, tone: 'var(--apple-text-secondary)' };
  }

  return { label: defaultLabel, badge: defaultLabel, tone: 'var(--apple-text-secondary)' };
};

const getProductImage = (product: Product) =>
  product.imageUrl ||
  product.image_url ||
  product.image ||
  product.thumbnail;

const getSourceLink = (product: Product) => {
  if (product.productUrl) return product.productUrl;
  if (product.product_url) return product.product_url;
  if (product.url) return product.url;

  if (Array.isArray(product.source)) {
    const withUrl = product.source.find((src) => src?.url);
    return withUrl?.url;
  }

  return undefined;
};

const annotateCitations = (products: Product[], citations?: string[]) => {
  if (!Array.isArray(products) || products.length === 0 || !Array.isArray(citations) || citations.length === 0) {
    return products;
  }

  const citationIndexes = Array.from(
    new Set(
      citations
        .map((citation) => {
          const match = citation.match(/DOC\s+(\d+)/i);
          return match ? parseInt(match[1], 10) - 1 : null;
        })
        .filter((idx): idx is number => idx !== null && idx >= 0 && idx < products.length)
    )
  );

  if (citationIndexes.length === 0) {
    return products;
  }

  return products.map((product, idx) =>
    citationIndexes.includes(idx) ? { ...product, cited: true } : product
  );
};

const reorderProductsByCitations = (products: Product[], citations?: string[]) => {
  if (!Array.isArray(products) || products.length === 0 || !Array.isArray(citations) || citations.length === 0) {
    return products;
  }

  const citationIndexes = Array.from(
    new Set(
      citations
        .map((citation) => {
          const match = citation.match(/DOC\s+(\d+)/i);
          return match ? parseInt(match[1], 10) - 1 : null;
        })
        .filter((idx): idx is number => idx !== null && idx >= 0 && idx < products.length)
    )
  );

  if (citationIndexes.length === 0) {
    return products;
  }

  const indexSet = new Set(citationIndexes);
  const citedProducts = citationIndexes.map((idx) => products[idx]);
  const remainingProducts = products.filter((_, idx) => !indexSet.has(idx));

  return [...citedProducts, ...remainingProducts];
};

const formatRating = (rating?: number | null) => {
  if (rating === null || rating === undefined) return 'N/A';
  return `${rating.toFixed(1)}★`;
};

const ResultPanel = ({
  result,
  isProcessing,
  onProductClick
}: ResultPanelProps) => {
  const [currentPage, setCurrentPage] = React.useState(0);
  const [sortConfig, setSortConfig] = React.useState<{key: 'price' | 'rating' | null, direction: 'asc' | 'desc'}>({
    key: null,
    direction: 'asc'
  });
  const PRODUCTS_PER_PAGE = 3;  // Show 3 products per page

  // Reset page when result changes
  React.useEffect(() => {
    setCurrentPage(0);
  }, [result]);

  const annotatedProducts = annotateCitations(result?.products || [], result?.citations);
  const allProducts = reorderProductsByCitations(annotatedProducts, result?.citations);
  
  const totalProducts = allProducts.length;
  const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
  const startIdx = currentPage * PRODUCTS_PER_PAGE;
  const endIdx = startIdx + PRODUCTS_PER_PAGE;
  
  // For product cards: paginated (3 per page)
  const displayedCards = allProducts.slice(startIdx, endIdx);
  
  // Sort function that puts null/undefined values at the end
  const sortProducts = (products: Product[], key: 'price' | 'rating', direction: 'asc' | 'desc') => {
    return [...products].sort((a, b) => {
      let aValue: number | null = null;
      let bValue: number | null = null;

      if (key === 'price') {
        // Parse price
        if (typeof a.price === 'number' && Number.isFinite(a.price)) {
          aValue = a.price;
        } else if (typeof a.price === 'string') {
          const match = a.price.match(/[\d,.]+/);
          if (match) {
            const parsed = parseFloat(match[0].replace(/,/g, ''));
            aValue = Number.isFinite(parsed) ? parsed : null;
          }
        }

        if (typeof b.price === 'number' && Number.isFinite(b.price)) {
          bValue = b.price;
        } else if (typeof b.price === 'string') {
          const match = b.price.match(/[\d,.]+/);
          if (match) {
            const parsed = parseFloat(match[0].replace(/,/g, ''));
            bValue = Number.isFinite(parsed) ? parsed : null;
          }
        }
      } else if (key === 'rating') {
        aValue = (a.rating !== null && a.rating !== undefined && Number.isFinite(a.rating)) ? a.rating : null;
        bValue = (b.rating !== null && b.rating !== undefined && Number.isFinite(b.rating)) ? b.rating : null;
      }

      // Handle null values - always put them at the end
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      // Normal comparison
      if (direction === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });
  };

  // Apply sorting to table products
  const tableProducts = React.useMemo(() => {
    if (sortConfig.key === null) {
      return allProducts;
    }
    return sortProducts(allProducts, sortConfig.key, sortConfig.direction);
  }, [allProducts, sortConfig]);

  // Toggle sort
  const handleSort = (key: 'price' | 'rating') => {
    setSortConfig(prev => {
      if (prev.key === key) {
        // Same key: toggle direction or reset
        if (prev.direction === 'asc') {
          return { key, direction: 'desc' };
        } else {
          return { key: null, direction: 'asc' }; // Reset
        }
      } else {
        // New key: start with ascending
        return { key, direction: 'asc' };
      }
    });
  };

  const hasProducts = allProducts.length > 0;
  
  // Show pagination controls if there are more than 3 products
  const showPagination = totalProducts > PRODUCTS_PER_PAGE;
  const showResults = result && !isProcessing && hasProducts;

  return (
    <div style={{ flex: '1', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      {showResults ? (
        <>
          {/* Product grid - Fixed height area for 3 products */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              padding: '12px 16px 8px 16px',
              flexShrink: 0
            }}
          >
              {displayedCards.map((product, idx) => {
                const imageSrc = getProductImage(product);
                const linkUrl = getSourceLink(product);
                const domainLabel = linkUrl ? formatSourceLabel(linkUrl) : '—';
                const sourceInfo = getSourceDisplay(product);

                return (
                <div
                  key={`${product.doc_id || product.title || idx}-${idx}`}
                  style={{
                    background: '#fff',
                    borderRadius: '18px',
                    padding: '18px',
                    boxShadow: '0 8px 30px rgba(15, 23, 42, 0.05)',
                    border: product.cited ? '1.5px solid rgba(0,122,255,0.3)' : '1px solid rgba(15, 23, 42, 0.08)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    position: 'relative',
                    transition: 'transform 0.2s, box-shadow 0.2s'
                  }}
                  onClick={() => onProductClick(product)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 12px 40px rgba(15, 23, 42, 0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 8px 30px rgba(15, 23, 42, 0.05)';
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        width: '100%',
                        height: '160px',
                        borderRadius: '16px',
                        background: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        padding: '12px',
                        border: '1px solid rgba(15, 23, 42, 0.08)',
                        marginTop: '16px',
                        boxSizing: 'border-box'
                      }}
                    >
                      {imageSrc ? (
                        <img
                          src={imageSrc}
                          alt={product.title || 'Product image'}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          loading="lazy"
                        />
                      ) : (
                        <span style={{ fontSize: 32, color: 'rgba(15, 23, 42, 0.2)' }}>🛍️</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 16,
                        fontWeight: 600,
                        color: '#0f172a',
                        minHeight: 44,
                        maxHeight: 44,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {product.title || 'Unnamed product'}
                    </h3>
                    {product.brand && (
                      <span style={{ fontSize: 13, color: 'var(--apple-text-secondary)' }}>
                        {product.brand}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--apple-primary)', minHeight: 26 }}>
                    {formatCurrency(product.price)}
                  </div>

                  <div style={{ fontSize: 13, color: 'var(--apple-text-secondary)', minHeight: 18 }}>
                    {sourceInfo?.label}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--apple-text-secondary)' }}>
                      {domainLabel}
                    </span>
                    {linkUrl ? (
                      <a
                        href={linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ textDecoration: 'none', color: 'var(--apple-primary)', fontWeight: 600, fontSize: 14 }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        View Product →
                      </a>
                    ) : (
                      <button
                        style={{
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          color: 'var(--apple-primary)',
                          fontWeight: 600,
                          fontSize: 14,
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        Details
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Compact Pagination Controls between cards and table */}
          {showPagination && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '4px 16px',
              flexShrink: 0
            }}>
              <button
                onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(15,23,42,0.12)',
                  outline: 'none',
                  background: currentPage === 0 ? 'rgba(15,23,42,0.03)' : '#fff',
                  color: currentPage === 0 ? 'var(--apple-text-secondary)' : 'var(--apple-primary)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                ← Previous
              </button>
              
              <span style={{
                fontSize: 13,
                color: 'var(--apple-text-secondary)',
                fontWeight: 500
              }}>
                {startIdx + 1}-{Math.min(endIdx, totalProducts)} of {totalProducts}
              </span>

              <button
                onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                disabled={currentPage >= totalPages - 1}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(15,23,42,0.12)',
                  outline: 'none',
                  background: currentPage >= totalPages - 1 ? 'rgba(15,23,42,0.03)' : '#fff',
                  color: currentPage >= totalPages - 1 ? 'var(--apple-text-secondary)' : 'var(--apple-primary)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Next →
              </button>
            </div>
          )}
          
          {/* Comparison Table - Scrollable for all products */}
          <div style={{ 
            margin: '8px 16px 16px 16px',
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            background: '#fff',
            borderRadius: '16px',
            border: '1px solid rgba(15,23,42,0.08)',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
          }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                  <tr style={{ background: 'rgba(15,23,42,0.03)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', color: 'var(--apple-text-secondary)', letterSpacing: '0.05em', borderBottom: '2px solid rgba(15,23,42,0.08)' }}>Product</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', color: 'var(--apple-text-secondary)', letterSpacing: '0.05em', borderBottom: '2px solid rgba(15,23,42,0.08)' }}>
                      <button
                        onClick={() => handleSort('price')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: 0,
                          fontSize: 13,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          color: sortConfig.key === 'price' ? 'var(--apple-primary)' : 'var(--apple-text-secondary)',
                          letterSpacing: '0.05em',
                          transition: 'color 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (sortConfig.key !== 'price') {
                            e.currentTarget.style.color = 'var(--apple-text)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (sortConfig.key !== 'price') {
                            e.currentTarget.style.color = 'var(--apple-text-secondary)';
                          }
                        }}
                      >
                        Price
                        <span style={{ fontSize: 10 }}>
                          {sortConfig.key === 'price' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </button>
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', color: 'var(--apple-text-secondary)', letterSpacing: '0.05em', borderBottom: '2px solid rgba(15,23,42,0.08)' }}>
                      <button
                        onClick={() => handleSort('rating')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: 0,
                          fontSize: 13,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          color: sortConfig.key === 'rating' ? 'var(--apple-primary)' : 'var(--apple-text-secondary)',
                          letterSpacing: '0.05em',
                          transition: 'color 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (sortConfig.key !== 'rating') {
                            e.currentTarget.style.color = 'var(--apple-text)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (sortConfig.key !== 'rating') {
                            e.currentTarget.style.color = 'var(--apple-text-secondary)';
                          }
                        }}
                      >
                        Rating
                        <span style={{ fontSize: 10 }}>
                          {sortConfig.key === 'rating' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </button>
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', color: 'var(--apple-text-secondary)', letterSpacing: '0.05em', borderBottom: '2px solid rgba(15,23,42,0.08)' }}>Doc ID</th>
                </tr>
              </thead>
              <tbody>
                  {tableProducts.map((product, idx) => {
                    return (
                      <tr key={`comparison-${product.doc_id || product.title || idx}`} style={{ borderBottom: idx < tableProducts.length - 1 ? '1px solid rgba(15,23,42,0.06)' : 'none' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: 14 }}>{product.title || 'Unnamed product'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 14 }}>{formatCurrency(product.price)}</td>
                        <td style={{ padding: '12px 16px', fontSize: 14 }}>{formatRating(product.rating)}</td>
                        <td style={{ padding: '12px 16px', color: product.cited ? 'var(--apple-primary)' : 'var(--apple-text-secondary)', fontWeight: product.cited ? 600 : 400, fontFamily: 'SF Mono, Monaco, monospace', fontSize: 12 }}>
                          {product.doc_id || '—'}
                    </td>
                  </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          textAlign: 'center'
        }}>
          <div style={{
            maxWidth: '800px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            width: '100%',
            padding: '0 16px'
          }}>
            <h2 style={{
              fontSize: '28px',
              fontWeight: 600,
              color: 'var(--apple-text)',
              margin: 0,
              letterSpacing: '-0.02em',
              lineHeight: 1.3,
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
              whiteSpace: 'nowrap',
              overflow: 'visible'
            }}>
              Ask agent to recommend products for&nbsp;you
            </h2>
            <p style={{
              fontSize: '15px',
              color: 'var(--apple-text-secondary)',
              margin: '0 auto',
              lineHeight: 1.6,
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
              maxWidth: '100%'
            }}>
              Use voice or text to describe what you're looking for, and our AI agent will find the best products&nbsp;for&nbsp;you.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultPanel;

