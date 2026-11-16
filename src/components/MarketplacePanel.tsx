import React, { useState } from 'react';
import { Check, Minus, Plus, Search, ShieldCheck, ShoppingBag, Trash2, X } from 'lucide-react';
import type { CartItem, CurrencyCode, GatewayName, Product, Transaction } from '../types.ts';

interface MarketplacePanelProps {
  products: Product[];
  loading: boolean;
  currency: CurrencyCode;
  gateway: GatewayName;
  cart: CartItem[];
  cartOpen: boolean;
  onSetCartOpen: (open: boolean) => void;
  onAddToCart: (product: Product) => void;
  onUpdateQty: (productId: number, delta: number) => void;
  onRemoveItem: (productId: number) => void;
  onCheckout: () => Promise<Transaction | undefined>;
}

export const MarketplacePanel: React.FC<MarketplacePanelProps> = ({
  products,
  loading,
  currency,
  gateway,
  cart,
  cartOpen,
  onSetCartOpen,
  onAddToCart,
  onUpdateQty,
  onRemoveItem,
  onCheckout,
}) => {
  const [category, setCategory] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});
  const [justAddedId, setJustAddedId] = useState<number | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutReceipt, setCheckoutReceipt] = useState<Transaction | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const categories = ['All', 'Wearables', 'Fashion', 'Audio', 'Luxury', 'Workspace'];
  const filteredProducts = products.filter((p) => {
    const matchesCat = category === 'All' || p.category === category;
    const matchesQuery =
      !query.trim() ||
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.description.toLowerCase().includes(query.toLowerCase());
    return matchesCat && matchesQuery;
  });

  const subtotal = cart.reduce((sum, item) => {
    const unit = currency === 'INR' ? item.product.priceINR : item.product.priceUSD;
    return sum + unit * item.quantity;
  }, 0);

  const handleAdd = (product: Product) => {
    onAddToCart(product);
    setJustAddedId(product.id);
    window.setTimeout(() => {
      setJustAddedId((curr) => (curr === product.id ? null : curr));
    }, 1200);
  };

  const handleCompleteCheckout = async () => {
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const txn = await onCheckout();
      if (txn) {
        setCheckoutReceipt(txn);
      }
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Checkout failed.');
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Storefront Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08] w-fit">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                category === cat
                  ? 'bg-[#D4A853] text-[#090C10] font-semibold'
                  : 'text-[#A8AEB5] hover:text-[#F2F1EC]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#8F969E] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search hardware..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-[#F2F1EC] placeholder-[#7E858E] focus:outline-none focus:border-[#D4A853]"
            />
          </div>

          <button
            type="button"
            onClick={() => onSetCartOpen(true)}
            className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-[#F2F1EC] flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-[#D4A853]" />
            <span className="font-mono tabular-nums">
              Bag ({cart.reduce((acc, i) => acc + i.quantity, 0)})
            </span>
          </button>
        </div>
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="glass-panel rounded-2xl p-4 h-[380px] animate-pulse bg-white/[0.03]"
            />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center space-y-2">
          <p className="text-sm text-[#EAE9E4]">No matching products found.</p>
          <button
            type="button"
            onClick={() => {
              setCategory('All');
              setQuery('');
            }}
            className="text-xs text-[#D4A853] underline cursor-pointer"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => {
            const isAdded = justAddedId === product.id;
            const formattedPrice =
              currency === 'INR'
                ? `₹${product.priceINR.toLocaleString('en-IN')}`
                : `$${product.priceUSD.toFixed(2)}`;

            return (
              <article
                key={product.id}
                className="glass-panel rounded-2xl overflow-hidden flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div>
                  <div className="aspect-[4/3] w-full bg-[#151A22] overflow-hidden">
                    {failedImages[product.id] ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#161B24] to-[#0D1117] text-[#8F969E]">
                        <ShoppingBag className="w-7 h-7 text-[#D4A853]" />
                        <span className="text-xs font-medium">{product.name}</span>
                      </div>
                    ) : (
                      <img
                        src={product.image}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [product.id]: true }))
                        }
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  <div className="p-5 space-y-2">
                    <div className="text-xs text-[#D4A853]">
                      {product.category}
                      {product.editorialLabel ? ` · ${product.editorialLabel}` : ''}
                    </div>
                    <h3 className="text-base font-semibold text-[#F2F1EC]">{product.name}</h3>
                    <p className="text-xs text-[#9BA1A8] leading-relaxed line-clamp-2">
                      {product.description}
                    </p>
                    <p className="text-xs text-[#7E858E] pt-1">{product.specs}</p>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
                  <span className="text-base font-bold font-mono tabular-nums text-[#F2F1EC]">
                    {formattedPrice}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAdd(product)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                      isAdded
                        ? 'bg-[#10B981] text-[#051810]'
                        : 'bg-[#D4A853] hover:bg-[#E0B96B] text-[#090C10]'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Added</span>
                      </>
                    ) : (
                      <span>Buy Now</span>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Slide-Over Cart & Zero-Trust Checkout Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0E131A] border-l border-white/[0.1] h-full flex flex-col justify-between p-6">
            <div className="space-y-5 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div>
                  <h3 className="text-lg font-bold text-[#F2F1EC]">Shopping Bag</h3>
                  <p className="text-xs text-[#8F969E]">
                    Auto-priced in {currency} · {gateway} Settlement
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSetCartOpen(false);
                    setCheckoutReceipt(null);
                  }}
                  className="p-2 rounded-lg text-[#9BA1A8] hover:text-white hover:bg-white/[0.06] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {checkoutReceipt ? (
                <div className="p-5 rounded-2xl bg-[#10B981]/10 border border-[#10B981]/30 space-y-3">
                  <div className="text-xs font-semibold text-[#6EE7B7]">
                    Order Confirmed · AES-256-GCM Sealed
                  </div>
                  <div className="text-base font-bold font-mono text-[#F2F1EC]">
                    {checkoutReceipt.transactionId}
                  </div>
                  <p className="text-xs text-[#C8CDD3]">
                    Settled{' '}
                    <span className="font-mono tabular-nums font-semibold">
                      {checkoutReceipt.currency === 'INR'
                        ? `₹${checkoutReceipt.amount.toLocaleString('en-IN')}`
                        : `$${checkoutReceipt.amount.toFixed(2)}`}
                    </span>{' '}
                    via {checkoutReceipt.gateway}. Preparing dispatch.
                  </p>
                </div>
              ) : cart.length === 0 ? (
                <div className="py-16 text-center text-sm text-[#8F969E]">
                  Your bag is empty. Add hardware from the catalog or ask your AI Concierge.
                </div>
              ) : (
                <div className="divide-y divide-white/[0.07]">
                  {cart.map((item) => {
                    const unit =
                      currency === 'INR' ? item.product.priceINR : item.product.priceUSD;
                    return (
                      <div key={item.product.id} className="py-4 flex items-center gap-4">
                        <img
                          src={item.product.image}
                          alt={item.product.name}
                          referrerPolicy="no-referrer"
                          className="w-16 h-12 object-cover rounded-lg bg-[#151A22] shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[#F2F1EC] truncate">
                            {item.product.name}
                          </div>
                          <div className="text-xs font-mono tabular-nums text-[#9BA1A8]">
                            {currency === 'INR'
                              ? `₹${(unit * item.quantity).toLocaleString('en-IN')}`
                              : `$${(unit * item.quantity).toFixed(2)}`}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.product.id, -1)}
                            className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[#EAE9E4] cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-mono tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.product.id, 1)}
                            className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[#EAE9E4] cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.product.id)}
                            className="p-1.5 rounded-lg text-[#8F969E] hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {cart.length > 0 && !checkoutReceipt && (
              <div className="pt-5 border-t border-white/[0.08] space-y-4">
                {checkoutError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                    {checkoutError}
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#9BA1A8]">Order Subtotal</span>
                  <span className="text-lg font-bold font-mono tabular-nums text-[#F2F1EC]">
                    {currency === 'INR'
                      ? `₹${subtotal.toLocaleString('en-IN')}`
                      : `$${subtotal.toFixed(2)}`}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={checkingOut}
                  onClick={() => void handleCompleteCheckout()}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] disabled:opacity-60 text-[#090C10] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {checkingOut
                      ? 'Sealing & Processing...'
                      : `Pay with VEXO Wallet (${gateway})`}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
