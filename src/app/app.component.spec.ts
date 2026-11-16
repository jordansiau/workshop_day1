import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AppComponent } from './app.component';
import { API_ORIGIN } from './links.service';

describe('Snip frontend', () => {
  let http: HttpTestingController;
  const link = { code: 'Ab123x', url: 'https://example.com', shortUrl: 'http://localhost:3100/Ab123x', hits: 0, createdAt: '2026-11-16T00:00:00.000Z' };
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppComponent], providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_ORIGIN, useValue: '' }] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function setup() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('/api/links').flush([]);
    fixture.detectChanges();
    return fixture;
  }
  it('shows empty state and labeled URL input', () => {
    const fixture = setup();
    expect(fixture.nativeElement.textContent).toContain('No links yet');
    expect(fixture.nativeElement.querySelector('label').htmlFor).toBe('url');
  });
  it('rejects empty, malformed and non-HTTP URLs without a POST', () => {
    const fixture = setup();
    for (const value of ['', 'hello', 'ftp://example.com', 'javascript:alert(1)']) {
      fixture.componentInstance.form.controls.url.setValue(value);
      fixture.componentInstance.submit();
      expect(fixture.componentInstance.form.invalid).toBeTrue();
    }
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#url-error').textContent).toContain('valid HTTP');
    http.expectNone(request => request.method === 'POST');
  });
  it('trims valid URL, prevents duplicate submits and refreshes after success', () => {
    const fixture = setup(); const app = fixture.componentInstance;
    app.form.controls.url.setValue(' https://example.com ');
    app.submit(); app.submit();
    const request = http.expectOne('/api/links');
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual({ url: link.url });
    expect(app.pending()).toBeTrue();
    request.flush(link);
    http.expectOne('/api/links').flush([link]); fixture.detectChanges();
    expect(app.pending()).toBeFalse(); expect(app.form.controls.url.value).toBe('');
    expect(fixture.nativeElement.textContent).toContain(link.code);
    expect(fixture.nativeElement.querySelector('.success a').getAttribute('href')).toBe(link.shortUrl);
  });
  it('renders API validation errors beside field and preserves input for retry', () => {
    const fixture = setup(); const app = fixture.componentInstance;
    app.form.controls.url.setValue(link.url); app.submit();
    http.expectOne('/api/links').flush({ error: 'Invalid URL from server' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#url-error').textContent).toContain('Invalid URL from server');
    expect(app.pending()).toBeFalse(); expect(app.form.controls.url.value).toBe(link.url);
  });
  it('shows network failure and allows a list retry', () => {
    const fixture = TestBed.createComponent(AppComponent); fixture.detectChanges();
    http.expectOne('/api/links').error(new ProgressEvent('error')); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cannot reach the server');
    fixture.componentInstance.refresh(); http.expectOne('/api/links').flush([link]); fixture.detectChanges();
    expect(fixture.componentInstance.listError()).toBe(''); expect(fixture.componentInstance.links().length).toBe(1);
  });
  it('ignores an older list response when a newer refresh completes', () => {
    const fixture = TestBed.createComponent(AppComponent); fixture.detectChanges();
    const older = http.expectOne('/api/links'); fixture.componentInstance.refresh();
    http.expectOne('/api/links').flush([link]); older.flush([]);
    expect(fixture.componentInstance.links()).toEqual([link]);
  });
});
