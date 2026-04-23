'use client';

/**
 * DockerHubBrowser
 *
 * A modal/sheet that lets users search Docker Hub, browse image tags, and
 * select an image+tag to populate a plugin node's runtime field.
 *
 * Integration points
 * ------------------
 * - Opens from ComponentPanel when the user clicks "Browse Docker Hub" next
 *   to the runtime input on a plugin node.
 * - On selection, calls `onSelect(imageRef)` with a fully-qualified reference
 *   such as `nginx:1.25` or `myorg/myimage:latest`.
 * - Reads approval status from the backend-annotated `approved` field returned
 *   by `GET /dockerhub/search`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, Loader2, Search, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DockerHubImage {
  repo_name: string;
  short_description: string;
  star_count: number;
  is_official: boolean;
  is_automated: boolean;
  approved: boolean;
}

interface DockerHubTag {
  name: string;
  full_size: number;
  last_updated: string;
}

interface DockerHubBrowserProps {
  open: boolean;
  onClose: () => void;
  /** Called with the selected image reference, e.g. "nginx:latest". */
  onSelect: (imageRef: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function ApprovalBadge({ approved }: { approved: boolean }) {
  if (approved) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        Approved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">
      <AlertTriangle className="h-3 w-3" />
      Not approved
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DockerHubBrowser({ open, onClose, onSelect }: DockerHubBrowserProps) {
  const [query, setQuery] = useState('');
  // debouncedQuery is what triggers network requests; query drives the input display only
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [images, setImages] = useState<DockerHubImage[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingImages, setLoadingImages] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [selectedImage, setSelectedImage] = useState<DockerHubImage | null>(null);
  const [tags, setTags] = useState<DockerHubTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagPage, setTagPage] = useState(1);
  const [tagTotalCount, setTagTotalCount] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset all state when the sheet closes
  useEffect(() => {
    if (!open) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setQuery('');
      setDebouncedQuery('');
      setImages([]);
      setTotalCount(0);
      setPage(1);
      setLoadingImages(false);
      setSelectedImage(null);
      setTags([]);
      setLoadingTags(false);
      setImageError(null);
      setTagError(null);
      setTagPage(1);
      setTagTotalCount(0);
    }
  }, [open]);

  // Update query immediately for input display; delay the actual search trigger
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
      setPage(1);
      setSelectedImage(null);
    }, 400);
  }, []);

  // Fetch images whenever debouncedQuery or page changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setImages([]);
      setTotalCount(0);
      setLoadingImages(false);
      return;
    }

    let cancelled = false;
    setLoadingImages(true);
    setImageError(null);

    fetch(`/api/dockerhub/search?query=${encodeURIComponent(debouncedQuery)}&page=${page}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setImages(data.results ?? []);
        setTotalCount(data.count ?? 0);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setImageError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingImages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, page]);

  // Fetch tags when an image is selected
  useEffect(() => {
    if (!selectedImage) return;

    let cancelled = false;
    setLoadingTags(true);
    setTagError(null);
    setTags([]);
    setTagPage(1);
    setTagTotalCount(0);

    const [namespace, repo] = selectedImage.repo_name.includes('/')
      ? selectedImage.repo_name.split('/', 2)
      : ['library', selectedImage.repo_name];

    fetch(`/api/dockerhub/tags/${encodeURIComponent(namespace)}/${encodeURIComponent(repo)}?page=1`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setTags(data.results ?? []);
        setTagTotalCount(data.count ?? 0);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setTagError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingTags(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedImage]);

  // Load more tags
  const loadMoreTags = useCallback(() => {
    if (!selectedImage) return;
    const nextPage = tagPage + 1;
    setTagPage(nextPage);

    const [namespace, repo] = selectedImage.repo_name.includes('/')
      ? selectedImage.repo_name.split('/', 2)
      : ['library', selectedImage.repo_name];

    fetch(`/api/dockerhub/tags/${encodeURIComponent(namespace)}/${encodeURIComponent(repo)}?page=${nextPage}`)
      .then((res) => res.json())
      .then((data) => {
        setTags((prev) => [...prev, ...(data.results ?? [])]);
      })
      .catch(() => {/* silently ignore pagination errors */});
  }, [selectedImage, tagPage]);

  const handleSelectTag = useCallback(
    (tag: DockerHubTag) => {
      if (!selectedImage) return;
      // Strip "library/" prefix — official image refs in Docker are plain "nginx:tag", not "library/nginx:tag"
      const repoName = selectedImage.repo_name.startsWith('library/')
        ? selectedImage.repo_name.slice('library/'.length)
        : selectedImage.repo_name;
      onSelect(`${repoName}:${tag.name}`);
      onClose();
    },
    [selectedImage, onSelect, onClose],
  );

  const pageSize = 20;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <Sheet open={open} onOpenChange={onClose} modal>
      <SheetContent side="right" className="flex w-[480px] flex-col overflow-hidden border-none sm:w-[560px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Browse Docker Hub
          </SheetTitle>
          <SheetDescription>
            Search for container images, browse tags, and select one to populate the plugin runtime field.
          </SheetDescription>
        </SheetHeader>

        {/* Search input */}
        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search images (e.g. nginx, python, redis…)"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              autoFocus
            />
          </div>
          {query && (
            <Button variant="ghost" size="icon" onClick={() => handleQueryChange('')}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Main content area */}
        <div className="mt-4 flex-1 overflow-y-auto">
          {/* Tag browser (image selected) */}
          {selectedImage ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedImage(null)}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back to results
                </Button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">{selectedImage.repo_name}</div>
                    <div className="mt-1 text-sm text-slate-600">{selectedImage.short_description || 'No description available.'}</div>
                  </div>
                  <ApprovalBadge approved={selectedImage.approved} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    {selectedImage.star_count.toLocaleString()} stars
                  </span>
                  {selectedImage.is_official && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">Official</span>
                  )}
                </div>
                {!selectedImage.approved && (
                  <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                    This image is not on the approved allowlist. You can still select it, but deployment will be blocked until an admin approves it.
                  </div>
                )}
              </div>

              <div className="text-sm font-medium text-slate-700">
                Tags{tagTotalCount > 0 ? ` (${tagTotalCount} total)` : ''}
              </div>

              {loadingTags && (
                <div className="flex items-center justify-center py-8 text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading tags…
                </div>
              )}

              {tagError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  Failed to load tags: {tagError}
                </div>
              )}

              {!loadingTags && tags.length === 0 && !tagError && (
                <div className="py-6 text-center text-sm text-slate-500">No tags found.</div>
              )}

              <div className="space-y-2">
                {tags.map((tag) => (
                  <button
                    key={tag.name}
                    type="button"
                    onClick={() => handleSelectTag(tag)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
                  >
                    <span className="font-mono text-sm font-medium text-slate-900">{tag.name}</span>
                    <span className="text-xs text-slate-500">{tag.full_size ? formatBytes(tag.full_size) : ''}</span>
                  </button>
                ))}
              </div>

              {tags.length < tagTotalCount && (
                <Button variant="outline" size="sm" className="w-full" onClick={loadMoreTags}>
                  Load more tags
                </Button>
              )}
            </div>
          ) : (
            /* Image search results */
            <div className="space-y-2">
              {(loadingImages || (query.trim() && query !== debouncedQuery)) && (
                <div className="flex items-center justify-center py-8 text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching…
                </div>
              )}

              {imageError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  Search failed: {imageError}
                </div>
              )}

              {!loadingImages && !imageError && debouncedQuery && images.length === 0 && (
                <div className="py-6 text-center text-sm text-slate-500">No images found for "{debouncedQuery}".</div>
              )}

              {!query && (
                <div className="py-8 text-center text-sm text-slate-500">
                  Type a keyword above to search Docker Hub.
                </div>
              )}

              {images.map((image) => (
                <button
                  key={image.repo_name}
                  type="button"
                  onClick={() => setSelectedImage(image)}
                  className="flex w-full flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900">{image.repo_name}</span>
                    <ApprovalBadge approved={image.approved} />
                  </div>
                  <div className="line-clamp-2 text-sm text-slate-600">
                    {image.short_description || 'No description available.'}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      {image.star_count.toLocaleString()}
                    </span>
                    {image.is_official && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">Official</span>
                    )}
                  </div>
                </button>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2 text-sm text-slate-600">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
