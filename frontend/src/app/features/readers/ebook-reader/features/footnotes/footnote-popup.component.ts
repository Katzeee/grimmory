import {AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, inject, input, OnDestroy, viewChild} from '@angular/core';
import {ReaderFootnoteService} from './footnote.service';

// The popup stays in the page while hidden: the engine lays a note out in it before showing it.
@Component({
  selector: 'app-reader-footnote-popup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {'(document:keydown.escape)': 'onEscape()'},
  template: `
    <div class="footnote-backdrop" [class.open]="footnotes.open()" (click)="footnotes.close()" aria-hidden="true"></div>
    <div class="footnote-popup"
      role="dialog"
      [class.open]="footnotes.open()"
      [style.background-color]="background()"
      [style.width.px]="footnotes.size().width"
      [style.height.px]="footnotes.size().height">
      <div class="footnote-content" #content></div>
    </div>
  `,
  styleUrls: ['./footnote-popup.component.scss']
})
export class ReaderFootnotePopupComponent implements AfterViewInit, OnDestroy {
  readonly footnotes = inject(ReaderFootnoteService);
  readonly background = input<string | undefined>();
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');

  ngAfterViewInit(): void {
    this.footnotes.attachContainer(this.content().nativeElement);
  }

  ngOnDestroy(): void {
    this.footnotes.close();
    this.footnotes.attachContainer(null);
  }

  onEscape(): void {
    if (this.footnotes.open()) this.footnotes.close();
  }
}
