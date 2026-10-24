import { useState } from 'react';
import { Camera, ImagePlus, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetRpgStateQueryKey,
  useVerifyPhoto,
  type PhotoVerificationInputItemType,
  type PhotoVerificationInputMimeType,
} from '@workspace/api-client-react';
import { Btn, Modal } from '@/components/kit';

type PhotoProofModalProps = {
  itemType: PhotoVerificationInputItemType;
  itemId: number;
  title: string;
  onClose: () => void;
};

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set<PhotoVerificationInputMimeType>(['image/jpeg', 'image/png', 'image/webp']);

function errorMessage(error: unknown) {
  const value = error as { data?: { error?: string }; message?: string };
  return value?.data?.error ?? value?.message ?? 'Photo verification failed. Please try again.';
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that photo.'));
    reader.onload = () => {
      const value = String(reader.result ?? '');
      const comma = value.indexOf(',');
      if (comma < 0) reject(new Error('Could not read that photo.'));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function PhotoProofButton({
  itemType,
  itemId,
  title,
  disabled = false,
}: {
  itemType: PhotoVerificationInputItemType;
  itemId: number;
  title: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button
      type="button"
      data-testid={`button-photo-proof-${itemType}-${itemId}`}
      aria-label={`Verify ${title} with a photo`}
      disabled={disabled}
      onClick={() => setOpen(true)}
      className="grid h-10 w-10 shrink-0 place-items-center border-2 border-[color:var(--pq-cyan)] text-[color:var(--pq-cyan)] transition-colors hover:bg-[color:var(--pq-cyan)]/10 disabled:cursor-not-allowed disabled:opacity-40"
    ><Camera size={17}/></button>
    {open && <PhotoProofModal itemType={itemType} itemId={itemId} title={title} onClose={() => setOpen(false)}/>}
  </>;
}

export function PhotoProofModal({ itemType, itemId, title, onClose }: PhotoProofModalProps) {
  const queryClient = useQueryClient();
  const [nonce] = useState(() => `${Date.now()}-${Math.random()}`);
  const mutationKey = ['verifyPhoto', 'photo-proof', nonce] as const;
  const verify = useVerifyPhoto({ mutation: { mutationKey } });
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [stage, setStage] = useState<'select' | 'failed' | 'success'>('select');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const clearPrivateMutation = () => {
    verify.reset();
    const cache = queryClient.getMutationCache();
    for (const mutation of cache.getAll()) {
      if (mutation.options.mutationKey?.[0] === 'verifyPhoto' && mutation.options.mutationKey?.[1] === 'photo-proof' && mutation.options.mutationKey?.[2] === nonce) {
        cache.remove(mutation);
      }
    }
  };

  const selectFile = (selected: File | undefined) => {
    setError('');
    if (!selected) return;
    if (!ACCEPTED_TYPES.has(selected.type as PhotoVerificationInputMimeType)) {
      setFile(null); setFileName('');
      setError('Choose a JPEG, PNG, or WebP photo.');
      return;
    }
    if (selected.size > MAX_PHOTO_BYTES) {
      setFile(null); setFileName('');
      setError('Photos must be 5 MB or smaller.');
      return;
    }
    setStage('select');
    setFile(selected);
    setFileName(selected.name);
    setMessage('');
  };

  const submit = async () => {
    if (!file || verify.isPending) return;
    setError('');
    try {
      const imageBase64 = await readBase64(file);
      const result = await verify.mutateAsync({
        data: {
          itemType,
          itemId,
          imageBase64,
          mimeType: file.type as PhotoVerificationInputMimeType,
        },
      });
      setFile(null); setFileName('');
      if (result.isVerified) {
        void queryClient.invalidateQueries({ queryKey: getGetRpgStateQueryKey() });
        setMessage(result.reason);
        setStage('success');
      } else {
        setMessage(result.reason);
        setStage('failed');
      }
    } catch (reason) {
      setFile(null); setFileName('');
      setMessage(errorMessage(reason));
      setStage('failed');
    } finally {
      clearPrivateMutation();
    }
  };

  const retake = () => {
    setFile(null); setFileName(''); setMessage(''); setError(''); setStage('select');
  };

  return <Modal title={stage === 'success' ? 'PROOF ACCEPTED' : stage === 'failed' ? 'PROOF NOT ACCEPTED' : 'VERIFY WITH A PHOTO'} onClose={onClose}>
    {stage === 'success' ? <div data-testid="photo-proof-success" role="status" className="space-y-4 text-center">
      <ShieldCheck className="mx-auto text-[color:var(--pq-cyan)]" size={40}/>
      <p className="pixel-title text-[9px] text-[color:var(--pq-gold)]">{itemType === 'habit' ? 'HABIT COMPLETE' : 'QUEST COMPLETE'}</p>
      <p className="text-sm text-[color:var(--pq-ink2)]">{message}</p>
      <p className="text-xs text-[color:var(--pq-mute)]">Your usual XP and Gold rewards were added.</p>
      <Btn testId="button-photo-proof-continue" onClick={onClose}>Continue</Btn>
    </div> : stage === 'failed' ? <div data-testid="photo-proof-failed" role="alert" className="space-y-4">
      <p className="text-sm text-[color:var(--pq-ink2)]">{message}</p>
      <p className="text-xs text-[color:var(--pq-mute)]">The item remains incomplete and no rewards were added.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Btn testId="button-photo-proof-leave" variant="quiet" onClick={onClose}>Leave incomplete</Btn>
        <Btn testId="button-photo-proof-retake" onClick={retake}><Camera size={15}/>Retake photo</Btn>
      </div>
    </div> : <div className="space-y-4">
      <p className="text-sm text-[color:var(--pq-ink2)]">Add a photo that clearly shows evidence for <b>{title}</b>.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="pixel-button inline-flex cursor-pointer items-center justify-center gap-2 border-2 border-black/20 bg-[color:var(--pq-cyan)] px-4 py-2.5 text-sm font-bold text-[color:var(--pq-panel2)]">
          <Camera size={16}/> Take a photo
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-testid="input-photo-proof-camera" onChange={(event) => { selectFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}/>
        </label>
        <label className="pixel-button inline-flex cursor-pointer items-center justify-center gap-2 border-2 border-[color:var(--pq-line)] bg-[color:var(--pq-line3)] px-4 py-2.5 text-sm font-bold text-[color:var(--pq-ink)]">
          <ImagePlus size={16}/> Upload a photo
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" data-testid="input-photo-proof-upload" onChange={(event) => { selectFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}/>
        </label>
      </div>
      {fileName && <p data-testid="text-photo-proof-file" className="truncate text-xs text-[color:var(--pq-mute)]">Selected: {fileName}</p>}
      {error && <p role="alert" className="text-xs text-[color:var(--pq-danger)]">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-[color:var(--pq-line3)] pt-4">
        <Btn testId="button-photo-proof-cancel" variant="quiet" disabled={verify.isPending} onClick={onClose}>Cancel</Btn>
        <Btn testId="button-photo-proof-submit" disabled={!file || verify.isPending} onClick={() => void submit()}>
          {verify.isPending ? <><LoaderCircle size={15} className="animate-spin"/>Checking...</> : 'Verify & complete'}
        </Btn>
      </div>
      <p className="text-[10px] text-[color:var(--pq-mute)]">Image is analyzed once and not saved.</p>
    </div>}
  </Modal>;
}
