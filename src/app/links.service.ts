import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, inject, isDevMode } from '@angular/core';
export interface LinkRecord { code: string; url: string; shortUrl: string; hits: number; createdAt: string; }
export const API_ORIGIN = new InjectionToken<string>('API_ORIGIN', { providedIn: 'root', factory: () => isDevMode() ? 'http://localhost:3000' : '' });
@Injectable({ providedIn: 'root' })
export class LinksService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${inject(API_ORIGIN)}/api/links`;
  list() { return this.http.get<LinkRecord[]>(this.endpoint); }
  create(url: string) { return this.http.post<LinkRecord>(this.endpoint, { url }); }
}
