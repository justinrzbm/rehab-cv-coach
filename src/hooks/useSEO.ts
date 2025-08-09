import { useEffect } from "react";

export function useSEO(title: string, description?: string, canonical?: string) {
  useEffect(() => {
    if (title) document.title = title.length > 60 ? title.slice(0, 57) + "..." : title;
    if (description) {
      let tag = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement('meta');
        tag.name = 'description';
        document.head.appendChild(tag);
      }
      tag.content = description.slice(0, 160);
    }
    if (canonical) {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = canonical;
    }
  }, [title, description, canonical]);
}
