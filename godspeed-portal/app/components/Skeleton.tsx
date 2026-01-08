/**
 * Skeleton Loading Components
 *
 * Provides better UX than spinners by showing layout structure while loading
 */

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
    return (
        <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
    );
}

export function AthleteDashboardSkeleton() {
    return (
        <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f]">
            {/* Navbar Skeleton */}
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 px-4 sm:px-6 py-4 flex justify-between items-center">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-6 w-20" />
            </nav>

            {/* Main Content Skeleton */}
            <main className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-5xl">
                <header className="mb-8 sm:mb-12">
                    <Skeleton className="h-8 sm:h-10 md:h-12 w-64 sm:w-80 mb-2" />
                    <Skeleton className="h-4 w-48" />
                </header>

                <section>
                    <Skeleton className="h-6 w-32 mb-4 sm:mb-6" />

                    <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                        {[1, 2].map((i) => (
                            <div key={i} className="flex flex-col gap-4 sm:gap-6">
                                {/* Info Card Skeleton */}
                                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <Skeleton className="h-7 w-40 mb-2" />
                                            <Skeleton className="h-4 w-32" />
                                        </div>
                                        <Skeleton className="h-6 w-16 rounded-full" />
                                    </div>
                                </div>

                                {/* Trading Card Skeleton */}
                                <div className="flex justify-center">
                                    <div className="w-full max-w-[320px]">
                                        <Skeleton className="h-[450px] w-full rounded-xl mb-4 sm:mb-6" />
                                        <Skeleton className="h-10 w-full rounded-full" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}

export function TradingCardSkeleton() {
    return (
        <div className="flex flex-col items-center">
            <Skeleton className="h-[450px] w-full max-w-[320px] rounded-xl mb-4 sm:mb-6" />
            <Skeleton className="h-10 w-full rounded-full" />
        </div>
    );
}
