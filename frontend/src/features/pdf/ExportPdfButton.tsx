import type { TripDetail } from '@sanchari/shared';
import { FileDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { itineraryFilename } from './filename';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser (and mobile PDF viewers) time to pick the file up.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Lazy-loads the PDF library on first click and downloads the Itinerary (F-7, frontend-spec §4.6). */
export function ExportPdfButton({ trip }: { trip: TripDetail }) {
  const [pending, setPending] = useState(false);

  const exportPdf = async () => {
    setPending(true);
    try {
      const [{ pdf }, { ItineraryPdfDocument }, { registerPdfFonts }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./ItineraryPdfDocument'),
        import('./fonts'),
      ]);
      registerPdfFonts();
      const blob = await pdf(<ItineraryPdfDocument trip={trip} />).toBlob();
      download(blob, itineraryFilename(trip.name));
    } catch (err) {
      console.error(err);
      toast.error('Could not create the PDF, please try again');
    } finally {
      setPending(false);
    }
  };

  return (
    <Button onClick={() => void exportPdf()} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}
      {pending ? 'Preparing PDF…' : 'Export PDF'}
    </Button>
  );
}
