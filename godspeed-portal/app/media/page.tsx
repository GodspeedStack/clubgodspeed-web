"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import { Upload, Image as ImageIcon, Video, X, Download, Star, Trash2, Play } from "lucide-react";
import { useToast } from "@/app/context/ToastContext";

interface MediaItem {
    id: string;
    type: "image" | "video";
    url: string;
    thumbnail?: string;
    uploadDate: Date;
    size: number;
    name: string;
    athleteId?: string;
    athleteName?: string;
    isFeatured: boolean;
}

export default function MediaPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [filterType, setFilterType] = useState<"all" | "image" | "video">("all");
    const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        } else if (user) {
            // Simulate loading media - In production, fetch from Firebase Storage
            setTimeout(() => {
                const mockMedia: MediaItem[] = [
                    {
                        id: "1",
                        type: "image",
                        url: "https://via.placeholder.com/400x300?text=Practice+Action+Shot",
                        uploadDate: new Date(2026, 0, 8),
                        size: 2048000,
                        name: "practice-jan-8.jpg",
                        athleteId: "athlete1",
                        athleteName: "John Smith",
                        isFeatured: true,
                    },
                    {
                        id: "2",
                        type: "video",
                        url: "https://www.w3schools.com/html/mov_bbb.mp4",
                        thumbnail: "https://via.placeholder.com/400x300?text=Game+Highlights",
                        uploadDate: new Date(2026, 0, 5),
                        size: 10240000,
                        name: "game-highlights.mp4",
                        athleteId: "athlete1",
                        athleteName: "John Smith",
                        isFeatured: false,
                    },
                    {
                        id: "3",
                        type: "image",
                        url: "https://via.placeholder.com/400x300?text=Team+Photo",
                        uploadDate: new Date(2026, 0, 3),
                        size: 1536000,
                        name: "team-photo.jpg",
                        isFeatured: false,
                    },
                ];
                setMediaItems(mockMedia);
                setDataLoading(false);
            }, 800);
        }
    }, [user, loading, router]);

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);

        // Simulate upload - In production, upload to Firebase Storage
        setTimeout(() => {
            const newItems: MediaItem[] = Array.from(files).map((file, index) => ({
                id: `new-${Date.now()}-${index}`,
                type: file.type.startsWith("image/") ? "image" : "video",
                url: URL.createObjectURL(file),
                uploadDate: new Date(),
                size: file.size,
                name: file.name,
                isFeatured: false,
            }));

            setMediaItems([...newItems, ...mediaItems]);
            setUploading(false);
            toast.success(`${files.length} file(s) uploaded successfully!`);

            // Reset input
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }, 1500);
    };

    const handleDelete = (id: string) => {
        setMediaItems(mediaItems.filter(item => item.id !== id));
        toast.success("Media deleted successfully");
        if (selectedMedia?.id === id) {
            setSelectedMedia(null);
        }
    };

    const toggleFeatured = (id: string) => {
        setMediaItems(mediaItems.map(item =>
            item.id === id ? { ...item, isFeatured: !item.isFeatured } : item
        ));
        toast.success("Updated featured status");
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    };

    const filteredMedia = mediaItems.filter(item =>
        filterType === "all" || item.type === filterType
    );

    if (loading || dataLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
                <div className="animate-pulse text-[#0071e3] font-bold text-xl">Loading Media...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f] animate-fadeIn">
            {/* Navbar */}
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 px-4 sm:px-6 py-4 flex justify-between items-center">
                <div className="font-extrabold tracking-widest text-sm sm:text-base md:text-lg">
                    GODSPEED<span className="text-[#0071e3]">MEDIA</span>
                </div>
                <button
                    onClick={() => router.push("/dashboard")}
                    className="text-sm font-semibold text-gray-500 hover:text-black transition-all duration-200 hover:scale-105"
                >
                    ← BACK
                </button>
            </nav>

            {/* Main Content */}
            <main className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-7xl">
                {/* Header */}
                <header className="mb-8 sm:mb-12">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold uppercase tracking-tight mb-2">
                                Media <span className="text-[#0071e3]">Gallery</span>
                            </h1>
                            <p className="text-sm sm:text-base text-gray-500">Upload and manage photos and videos</p>
                        </div>
                        <div className="flex gap-3">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,video/*"
                                multiple
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="bg-[#0071e3] text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-[#005bb5] hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2 disabled:bg-gray-400"
                            >
                                <Upload className="w-4 h-4" />
                                {uploading ? "UPLOADING..." : "UPLOAD MEDIA"}
                            </button>
                        </div>
                    </div>
                </header>

                {/* Filter Buttons */}
                <div className="flex flex-wrap gap-2 mb-6">
                    <button
                        onClick={() => setFilterType("all")}
                        className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${
                            filterType === "all"
                                ? "bg-[#0071e3] text-white shadow-lg"
                                : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                    >
                        All Media ({mediaItems.length})
                    </button>
                    <button
                        onClick={() => setFilterType("image")}
                        className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${
                            filterType === "image"
                                ? "bg-green-500 text-white shadow-lg"
                                : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                    >
                        <ImageIcon className="w-4 h-4 inline mr-1" />
                        Photos ({mediaItems.filter(m => m.type === "image").length})
                    </button>
                    <button
                        onClick={() => setFilterType("video")}
                        className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${
                            filterType === "video"
                                ? "bg-purple-500 text-white shadow-lg"
                                : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                    >
                        <Video className="w-4 h-4 inline mr-1" />
                        Videos ({mediaItems.filter(m => m.type === "video").length})
                    </button>
                </div>

                {/* Media Grid */}
                {filteredMedia.length === 0 ? (
                    <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center shadow-sm animate-slideUp">
                        <Upload className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">No Media Yet</h3>
                        <p className="text-gray-500 mb-6">Upload photos and videos of your athlete</p>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-[#0071e3] text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-[#005bb5] transition-all"
                        >
                            Upload Your First File
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredMedia.map((item, index) => (
                            <div
                                key={item.id}
                                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group animate-slideUp"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                {/* Media Preview */}
                                <div
                                    className="relative aspect-video bg-gray-100 cursor-pointer"
                                    onClick={() => setSelectedMedia(item)}
                                >
                                    {item.type === "image" ? (
                                        <img
                                            src={item.url}
                                            alt={item.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="relative w-full h-full">
                                            <img
                                                src={item.thumbnail || item.url}
                                                alt={item.name}
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                <div className="p-4 bg-white/90 rounded-full">
                                                    <Play className="w-8 h-8 text-[#0071e3]" fill="currentColor" />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {item.isFeatured && (
                                        <div className="absolute top-2 right-2 p-2 bg-yellow-400 rounded-full">
                                            <Star className="w-4 h-4 text-white" fill="currentColor" />
                                        </div>
                                    )}
                                </div>

                                {/* Media Info */}
                                <div className="p-4">
                                    <h3 className="font-bold text-gray-900 text-sm truncate mb-1">{item.name}</h3>
                                    <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                                        <span>{formatFileSize(item.size)}</span>
                                        <span>{item.uploadDate.toLocaleDateString()}</span>
                                    </div>
                                    {item.athleteName && (
                                        <p className="text-xs text-gray-600 mb-3 truncate">
                                            <span className="font-semibold">Athlete:</span> {item.athleteName}
                                        </p>
                                    )}

                                    {/* Actions */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => toggleFeatured(item.id)}
                                            className={`flex-1 px-3 py-2 rounded-lg font-bold text-xs transition-all ${
                                                item.isFeatured
                                                    ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                            }`}
                                        >
                                            <Star className="w-3 h-3 inline mr-1" />
                                            {item.isFeatured ? "Featured" : "Feature"}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(item.id)}
                                            className="px-3 py-2 bg-red-100 text-red-700 rounded-lg font-bold text-xs hover:bg-red-200 transition-all"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Media Preview Modal */}
            {selectedMedia && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setSelectedMedia(null);
                        }
                    }}
                >
                    <div className="relative max-w-5xl w-full bg-white rounded-2xl overflow-hidden animate-slideUp">
                        <button
                            onClick={() => setSelectedMedia(null)}
                            className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white rounded-full transition-colors z-10"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="max-h-[80vh] overflow-y-auto">
                            {selectedMedia.type === "image" ? (
                                <img
                                    src={selectedMedia.url}
                                    alt={selectedMedia.name}
                                    className="w-full h-auto"
                                />
                            ) : (
                                <video
                                    src={selectedMedia.url}
                                    controls
                                    className="w-full h-auto"
                                    autoPlay
                                />
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-100">
                            <h3 className="font-bold text-gray-900 text-lg mb-2">{selectedMedia.name}</h3>
                            <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                                <span>{formatFileSize(selectedMedia.size)}</span>
                                <span>{selectedMedia.uploadDate.toLocaleDateString()}</span>
                                {selectedMedia.athleteName && <span>Athlete: {selectedMedia.athleteName}</span>}
                            </div>
                            <div className="flex gap-3">
                                <a
                                    href={selectedMedia.url}
                                    download={selectedMedia.name}
                                    className="flex-1 bg-[#0071e3] text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-[#005bb5] transition-all text-center flex items-center justify-center gap-2"
                                >
                                    <Download className="w-4 h-4" />
                                    Download
                                </a>
                                <button
                                    onClick={() => {
                                        handleDelete(selectedMedia.id);
                                        setSelectedMedia(null);
                                    }}
                                    className="px-6 py-3 bg-red-500 text-white rounded-full font-bold text-sm hover:bg-red-600 transition-all flex items-center gap-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
