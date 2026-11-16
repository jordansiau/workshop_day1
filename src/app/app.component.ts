import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, ReactiveFormsModule, ValidationErrors, FormControl, FormGroup, Validators } from '@angular/forms';
import { finalize, switchMap } from 'rxjs';
import { LinkRecord, LinksService } from './links.service';
export function httpUrl(control: AbstractControl): ValidationErrors | null {
  try { const url = new URL(String(control.value).trim()); return ['http:', 'https:'].includes(url.protocol) ? null : { httpUrl: true }; }
  catch { return { httpUrl: true }; }
}
@Component({ selector: 'app-root', imports: [ReactiveFormsModule], templateUrl: './app.component.html', styleUrl: './app.component.css' })
export class AppComponent implements OnInit {
  private readonly api = inject(LinksService);
  readonly form = new FormGroup({ url: new FormControl('', { nonNullable: true, validators: [Validators.required, httpUrl] }) });
  readonly links = signal<LinkRecord[]>([]);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly listError = signal('');
  readonly submitError = signal('');
  readonly result = signal<LinkRecord | null>(null);
  private requestVersion = 0;
  ngOnInit() { this.refresh(); }
  refresh() {
    const version = ++this.requestVersion;
    this.loading.set(true); this.listError.set('');
    this.api.list().subscribe({
      next: links => { if (version === this.requestVersion) { this.links.set(links); this.loading.set(false); } },
      error: error => { if (version === this.requestVersion) { this.listError.set(this.message(error)); this.loading.set(false); } }
    });
  }
  submit() {
    if (this.pending()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.submitError.set(''); this.result.set(null); this.pending.set(true);
    this.api.create(this.form.controls.url.value.trim()).pipe(finalize(() => this.pending.set(false))).subscribe({
      next: link => { this.result.set(link); this.form.reset(); this.refresh(); },
      error: error => this.submitError.set(this.message(error))
    });
  }
  private message(error: HttpErrorResponse) {
    return typeof error.error?.error === 'string' ? error.error.error : error.status === 0
      ? 'Cannot reach the server. Check your connection and try again.' : 'The request failed. Please try again.';
  }
}
