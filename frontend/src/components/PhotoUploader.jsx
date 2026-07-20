import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, X, Loader2 } from "lucide-react";
import { apiClient, API, TOKEN_KEY, formatApiErrorDetail } from "@/lib/api";

const MAX_PHOTOS = 5;

export const PhotoUploader = ({ bookingId, photos: initialPhotos = [], canDelete = true, onChange }) => {
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setPhotos(initialPhotos);
  }, [initialPhotos]);

  const handlePick = () => inputRef.current?.click();

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!bookingId) {
      toast.error("Save the booking first before uploading photos");
      return;
    }
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_PHOTOS} photos`);
      return;
    }
    const toUpload = files.slice(0, remaining);
    setUploading(true);
    let added = [];
    try {
      for (const file of toUpload) {
        const form = new FormData();
        form.append("file", file);
        const { data } = await apiClient.post(
          `/bookings/${bookingId}/photos`,
          form,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
        added.push(data);
      }
      const next = [...photos, ...added];
      setPhotos(next);
      onChange?.(next);
      toast.success(`Uploaded ${added.length} photo${added.length > 1 ? "s" : ""}`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photoId) => {
    if (!bookingId) return;
    try {
      await apiClient.delete(`/bookings/${bookingId}/photos/${photoId}`);
      const next = photos.filter((p) => p.id !== photoId);
      setPhotos(next);
      onChange?.(next);
      toast.success("Photo removed");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Delete failed");
    }
  };

  const token = localStorage.getItem(TOKEN_KEY);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {photos.map((p) => (
          <div
            key={p.id}
            className="relative aspect-square neu-inset overflow-hidden group"
            data-testid={`photo-thumb-${p.id}`}
          >
            <img
              src={`${API}/files/${p.id}?auth=${token}`}
              alt={p.original_filename || "Jewellery"}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {canDelete && (
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-[#7E2C3E]/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`photo-delete-${p.id}`}
                title="Remove"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={handlePick}
            disabled={uploading || !bookingId}
            className="aspect-square neu-btn flex flex-col items-center justify-center text-[#B097D1] hover:text-white disabled:opacity-50"
            data-testid="photo-upload-trigger"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Camera className="w-5 h-5 mb-1" />
                <span className="text-[11px]">Add photo</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleFiles}
        data-testid="photo-file-input"
      />

      <div className="text-[11px] text-[#B097D1]">
        Up to {MAX_PHOTOS} photos · JPG/PNG/WebP · max 8 MB each
        {!bookingId && " · Save the booking first to add photos"}
      </div>
    </div>
  );
};
