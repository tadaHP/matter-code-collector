'use client';

import { BrowserQRCodeSvgWriter, type IScannerControls } from '@zxing/browser';
import { X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type Device = {
  id: string;
  alias: string;
  deviceName: string;
  qrPayload: string;
  numericCode: string;
  manufacturer: string;
  model: string;
  location: string;
  tags: Tag[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type Tag = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type ManagedLocation = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type DeviceForm = Omit<Device, 'id' | 'createdAt' | 'updatedAt' | 'tags'> & {
  tagIds: string[];
};

type FilterOption = {
  label: string;
  value: string;
};

type View = 'list' | 'create' | 'edit';
type ScanState = 'idle' | 'requesting' | 'success' | 'denied' | 'blocked' | 'unsupported' | 'insecure';

const emptyForm: DeviceForm = {
  alias: '',
  deviceName: '',
  qrPayload: '',
  numericCode: '',
  manufacturer: '',
  model: '',
  location: '',
  tagIds: [],
  notes: '',
};

const buttonPrimary =
  'inline-flex h-10 max-w-full items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2';
const buttonSecondary =
  'inline-flex h-10 max-w-full items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2';
const buttonDanger =
  'inline-flex h-10 max-w-full items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2';
const inputClass =
  'h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100';

export default function Home() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [view, setView] = useState<View>('list');
  const [query, setQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('전체');
  const [manufacturerFilter, setManufacturerFilter] = useState('전체');
  const [tagFilter, setTagFilter] = useState('전체');
  const [managedTags, setManagedTags] = useState<Tag[]>([]);
  const [managedLocations, setManagedLocations] = useState<ManagedLocation[]>([]);
  const [sort, setSort] = useState('최근 수정순');
  const [form, setForm] = useState<DeviceForm>(emptyForm);
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [toast, setToast] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadSession();
  }, []);

  const locations = useMemo(
    () => [
      '전체',
      ...Array.from(
        new Set([
          ...managedLocations.map((location) => location.name),
          ...devices.map((device) => device.location).filter(Boolean),
        ]),
      ),
    ],
    [devices, managedLocations],
  );
  const manufacturers = useMemo(
    () => ['전체', ...Array.from(new Set(devices.map((device) => device.manufacturer).filter(Boolean))).sort()],
    [devices],
  );
  const manufacturerOptions = useMemo(
    () => Array.from(new Set(devices.map((device) => device.manufacturer).filter(Boolean))).sort(),
    [devices],
  );
  const filterTags = useMemo<FilterOption[]>(
    () => [{ label: '전체', value: '전체' }, ...managedTags.map((tag) => ({ label: tag.name, value: tag.id }))],
    [managedTags],
  );

  const filteredDevices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = devices.filter((device) => {
      const text = [
        device.alias,
        device.qrPayload,
        device.numericCode,
        device.manufacturer,
        device.model,
        device.location,
        device.notes,
        device.tags.map((tag) => tag.name).join(' '),
      ]
        .join(' ')
        .toLowerCase();
      const matchesQuery = !normalizedQuery || text.includes(normalizedQuery);
      const matchesLocation = locationFilter === '전체' || device.location === locationFilter;
      const matchesManufacturer = manufacturerFilter === '전체' || device.manufacturer === manufacturerFilter;
      const matchesTag = tagFilter === '전체' || device.tags.some((tag) => tag.id === tagFilter);

      return matchesQuery && matchesLocation && matchesManufacturer && matchesTag;
    });

    return filtered.sort((a, b) => {
      if (sort === '이름순') return a.alias.localeCompare(b.alias, 'ko');
      if (sort === '최근 등록순') return b.createdAt.localeCompare(a.createdAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [devices, locationFilter, manufacturerFilter, query, sort, tagFilter]);

  const selectedDevice =
    devices.find((device) => device.id === selectedId) ?? filteredDevices[0] ?? devices[0] ?? null;

  async function loadSession() {
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/session');

      if (!response.ok) {
        setIsAuthed(false);
        setDevices([]);
        setManagedTags([]);
        setManagedLocations([]);
        return;
      }

      setIsAuthed(true);
      await loadData();
    } finally {
      setIsLoading(false);
    }
  }

  async function loadData() {
    const [devicesResponse, tagsResponse, locationsResponse] = await Promise.all([
      fetch('/api/devices'),
      fetch('/api/tags'),
      fetch('/api/locations'),
    ]);

    if (!devicesResponse.ok || !tagsResponse.ok || !locationsResponse.ok) {
      setIsAuthed(false);
      setDevices([]);
      setManagedTags([]);
      setManagedLocations([]);
      return;
    }

    const devicesPayload = (await devicesResponse.json()) as { devices: Device[] };
    const tagsPayload = (await tagsResponse.json()) as { tags: Tag[] };
    const locationsPayload = (await locationsResponse.json()) as { locations: ManagedLocation[] };

    setDevices(devicesPayload.devices);
    setManagedTags(tagsPayload.tags);
    setManagedLocations(locationsPayload.locations);
    setSelectedId((current) => current || devicesPayload.devices[0]?.id || '');
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get('loginId') ?? '');
    const password = String(formData.get('password') ?? '');

    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setLoginError('로그인 정보를 확인해 주세요.');
        return;
      }

      setIsAuthed(true);
      await loadData();
      showToast('로그인되었습니다.');
    } finally {
      setIsLoggingIn(false);
    }
  }

  function startCreate() {
    setForm(emptyForm);
    setScanState('idle');
    setView('create');
  }

  function startEdit(device: Device) {
    setForm({
      alias: device.alias,
      deviceName: '',
      qrPayload: device.qrPayload,
      numericCode: device.numericCode,
      manufacturer: device.manufacturer,
      model: device.model,
      location: device.location,
      tagIds: device.tags.map((tag) => tag.id),
      notes: device.notes,
    });
    setScanState('idle');
    setView('edit');
  }

  function updateForm(field: keyof DeviceForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleFormTag(tagId: string) {
    setForm((current) => ({
      ...current,
      tagIds: current.tagIds.includes(tagId)
        ? current.tagIds.filter((item) => item !== tagId)
        : [...current.tagIds, tagId],
    }));
  }

  async function addManagedTag(tag: string) {
    const normalized = tag.trim();

    if (!normalized) {
      showToast('태그 이름을 입력해 주세요.');
      return;
    }

    const response = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: normalized }),
    });

    await handleMutationResponse(response, `${normalized} 태그를 추가했습니다.`);
    await loadData();
  }

  async function renameManagedTag(tagId: string, next: string) {
    const normalized = next.trim();

    if (!normalized) {
      showToast('태그 이름을 입력해 주세요.');
      return;
    }

    const response = await fetch(`/api/tags/${tagId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: normalized }),
    });

    await handleMutationResponse(response, `${normalized} 태그로 변경했습니다.`);
    await loadData();
  }

  async function deleteManagedTag(tagId: string) {
    const response = await fetch(`/api/tags/${tagId}`, { method: 'DELETE' });

    await handleMutationResponse(response, '태그를 삭제하고 기기 바인딩에서 제거했습니다.');
    setTagFilter((current) => (current === tagId ? '전체' : current));
    await loadData();
  }

  async function addManagedLocation(location: string) {
    const normalized = location.trim();

    if (!normalized) {
      showToast('위치 이름을 입력해 주세요.');
      return;
    }

    const response = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: normalized }),
    });

    await handleMutationResponse(response, `${normalized} 위치를 추가했습니다.`);
    await loadData();
  }

  async function renameManagedLocation(locationId: string, next: string) {
    const normalized = next.trim();

    if (!normalized) {
      showToast('위치 이름을 입력해 주세요.');
      return;
    }

    const response = await fetch(`/api/locations/${locationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: normalized }),
    });

    await handleMutationResponse(response, `${normalized} 위치로 변경했습니다.`);
    setLocationFilter((current) => {
      const renamed = managedLocations.find((location) => location.id === locationId);
      return renamed && current === renamed.name ? normalized : current;
    });
    await loadData();
  }

  async function deleteManagedLocation(locationId: string) {
    const deleted = managedLocations.find((location) => location.id === locationId);
    const response = await fetch(`/api/locations/${locationId}`, { method: 'DELETE' });

    await handleMutationResponse(response, '위치를 삭제하고 연결된 기기의 위치를 비웠습니다.');
    setLocationFilter((current) => (deleted && current === deleted.name ? '전체' : current));
    await loadData();
  }

  function handleScanState(nextState: ScanState) {
    setScanState(nextState);
  }

  function handleScanResult(value: string) {
    setScanState('success');
    setForm((current) => ({
      ...current,
      qrPayload: value,
    }));
    showToast('실제 QR 스캔값이 등록 폼에 적용되었습니다.');
  }

  async function saveDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.alias.trim() || !form.qrPayload.trim() || !form.numericCode.trim()) {
      showToast('별명, QR 인식값, 숫자 코드는 필수입니다.');
      return;
    }

    const url = view === 'edit' && selectedDevice ? `/api/devices/${selectedDevice.id}` : '/api/devices';
    const response = await fetch(url, {
      method: view === 'edit' ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    const payload = await handleMutationResponse<{ device: Device }>(
      response,
      view === 'edit' ? '기기를 수정했습니다.' : '새 기기를 등록했습니다.',
    );

    if (payload?.device) setSelectedId(payload.device.id);
    setView('list');
    await loadData();
  }

  async function copyValue(label: string, value: string) {
    try {
      await navigator.clipboard?.writeText(value);
      showToast(`${label} 복사됨`);
    } catch {
      showToast(`${label} 복사됨`);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    const deletedId = deleteTarget.id;
    const response = await fetch(`/api/devices/${deletedId}`, { method: 'DELETE' });

    await handleMutationResponse(response, '기기를 삭제했습니다.');
    setDeleteTarget(null);
    setSelectedId((current) => {
      if (current !== deletedId) return current;
      return devices.find((device) => device.id !== deletedId)?.id ?? '';
    });
    await loadData();
  }

  async function exportData(format: 'JSON' | 'CSV') {
    const response = await fetch(`/api/export?format=${format.toLowerCase()}`);

    if (!response.ok) {
      await handleMutationResponse(response, '');
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = format === 'JSON' ? 'matter-code-collector.json' : 'matter-devices.csv';
    link.click();
    URL.revokeObjectURL(url);
    showToast(`${format} 백업 파일을 내려받았습니다.`);
  }

  async function handleMutationResponse<T = unknown>(response: Response, successMessage: string) {
    const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;

    if (!response.ok) {
      showToast(payload?.message ?? '요청을 처리하지 못했습니다.');
      return null;
    }

    if (successMessage) showToast(successMessage);
    return payload;
  }

  if (isLoading || isAuthed === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 text-zinc-950">
        <p className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold shadow-sm">
          앱 상태를 확인하는 중입니다...
        </p>
      </main>
    );
  }

  if (!isAuthed) {
    return <LoginScreen error={loginError} isLoggingIn={isLoggingIn} onSubmit={handleLogin} />;
  }

  return (
    <main className="min-w-0 overflow-x-hidden bg-zinc-100 text-zinc-950">
      <header className="sticky top-0 z-20 w-full min-w-0 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Private Matter Vault</p>
            <h1 className="break-words text-2xl font-bold tracking-tight text-zinc-950">Matter Code Collector</h1>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <label className="sr-only" htmlFor="device-search">
              기기 검색
            </label>
            <input
              id="device-search"
              className={`${inputClass} sm:w-72`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="별명, 위치, QR 값 검색"
            />
            <button className={`${buttonSecondary} w-full sm:w-auto`} type="button" onClick={() => setExportOpen(true)}>
              내보내기
            </button>
            <button className={`${buttonPrimary} w-full sm:w-auto`} type="button" onClick={startCreate}>
              새 기기 등록
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)_360px] lg:px-8">
        <FilterPanel
          locationFilter={locationFilter}
          locations={locations}
          manufacturerFilter={manufacturerFilter}
          manufacturers={manufacturers}
          setManufacturerFilter={setManufacturerFilter}
          setLocationFilter={setLocationFilter}
          setSort={setSort}
          setTagFilter={setTagFilter}
          sort={sort}
          tagFilter={tagFilter}
          tags={filterTags}
          managedTags={managedTags}
          managedLocations={managedLocations}
          onAddLocation={addManagedLocation}
          onDeleteLocation={deleteManagedLocation}
          onRenameLocation={renameManagedLocation}
          onAddTag={addManagedTag}
          onDeleteTag={deleteManagedTag}
          onRenameTag={renameManagedTag}
        />

        {view === 'list' ? (
          <DeviceList
            devices={filteredDevices}
            onCreate={startCreate}
            onSelect={(id) => {
              setSelectedId(id);
              setView('list');
            }}
            selectedId={selectedDevice?.id ?? ''}
            total={devices.length}
          />
        ) : (
          <DeviceFormView
            duplicateDevice={devices.find(
              (device) =>
                (device.qrPayload === form.qrPayload || device.numericCode === form.numericCode) &&
                device.id !== (view === 'edit' ? selectedDevice?.id : undefined) &&
                Boolean(form.qrPayload || form.numericCode),
            )}
            form={form}
            mode={view}
            onCancel={() => setView('list')}
            onScanResult={handleScanResult}
            onScanState={handleScanState}
            onSubmit={saveDevice}
            scanState={scanState}
            managedTags={managedTags}
            managedLocations={managedLocations}
            manufacturerOptions={manufacturerOptions}
            toggleFormTag={toggleFormTag}
            updateForm={updateForm}
          />
        )}

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          {selectedDevice ? (
            <DeviceDetail
              device={selectedDevice}
              onCopy={copyValue}
              onDelete={() => setDeleteTarget(selectedDevice)}
              onEdit={() => startEdit(selectedDevice)}
            />
          ) : (
            <EmptyDetail onCreate={startCreate} />
          )}
        </aside>
      </div>

      <button
        className="fixed bottom-5 right-5 z-20 inline-flex h-12 items-center justify-center rounded-lg bg-emerald-700 px-5 text-sm font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-800 lg:hidden"
        type="button"
        onClick={startCreate}
      >
        새 기기 등록
      </button>

      {deleteTarget ? (
        <DeleteDialog device={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
      ) : null}

      {exportOpen ? (
        <ExportDialog
          count={devices.length}
          onClose={() => setExportOpen(false)}
          onExport={(format) => {
            setExportOpen(false);
            void exportData(format);
          }}
        />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </main>
  );
}

function LoginScreen({
  error,
  isLoggingIn,
  onSubmit,
}: {
  error: string;
  isLoggingIn: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="flex min-h-screen min-w-0 items-center justify-center overflow-x-hidden bg-zinc-100 px-4 py-10 text-zinc-950">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Private Matter Vault</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Matter Code Collector</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">개인 Matter QR 코드 보관함에 로그인합니다.</p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-sm font-semibold text-zinc-800" htmlFor="login-id">
              로그인 식별자
            </label>
            <input
              className={inputClass}
              id="login-id"
              name="loginId"
              placeholder="예: admin"
              type="text"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-zinc-800" htmlFor="password">
              비밀번호
            </label>
            <input className={inputClass} id="password" name="password" placeholder="예: change-me" type="password" />
          </div>
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}
          <button className={`${buttonPrimary} w-full`} disabled={isLoggingIn} type="submit">
            {isLoggingIn ? '확인 중...' : '로그인'}
          </button>
        </form>

        <div className="mt-6 rounded-lg bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
          공개 회원가입 없이 개인 계정으로만 접근합니다. 개발 기본 계정은 `admin / admin`입니다.
        </div>
      </section>
    </main>
  );
}

function FilterPanel({
  locationFilter,
  locations,
  manufacturerFilter,
  manufacturers,
  managedLocations,
  managedTags,
  onAddLocation,
  onAddTag,
  onDeleteLocation,
  onDeleteTag,
  onRenameLocation,
  onRenameTag,
  setLocationFilter,
  setManufacturerFilter,
  setSort,
  setTagFilter,
  sort,
  tagFilter,
  tags,
}: {
  locationFilter: string;
  locations: string[];
  manufacturerFilter: string;
  manufacturers: string[];
  managedLocations: ManagedLocation[];
  managedTags: Tag[];
  onAddLocation: (location: string) => void;
  onAddTag: (tag: string) => void;
  onDeleteLocation: (locationId: string) => void;
  onDeleteTag: (tagId: string) => void;
  onRenameLocation: (locationId: string, next: string) => void;
  onRenameTag: (tagId: string, next: string) => void;
  setLocationFilter: (value: string) => void;
  setManufacturerFilter: (value: string) => void;
  setSort: (value: string) => void;
  setTagFilter: (value: string) => void;
  sort: string;
  tagFilter: string;
  tags: FilterOption[];
}) {
  const [locationManagerOpen, setLocationManagerOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);

  return (
    <aside className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 lg:sticky lg:top-24 lg:self-start">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-950">필터</h2>
        <button
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
          type="button"
          onClick={() => {
            setLocationFilter('전체');
            setManufacturerFilter('전체');
            setTagFilter('전체');
            setSort('최근 수정순');
          }}
        >
          초기화
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <FilterGroup
          label="위치"
          managerOpen={locationManagerOpen}
          onToggleManager={() => setLocationManagerOpen((current) => !current)}
          options={locations}
          selected={locationFilter}
          onSelect={setLocationFilter}
        />
        {locationManagerOpen ? (
          <LocationManager
            managedLocations={managedLocations}
            onAddLocation={onAddLocation}
            onDeleteLocation={onDeleteLocation}
            onRenameLocation={onRenameLocation}
          />
        ) : null}
        <FilterGroup label="제조사" options={manufacturers} selected={manufacturerFilter} onSelect={setManufacturerFilter} />
        <FilterGroup
          label="태그"
          managerOpen={tagManagerOpen}
          onToggleManager={() => setTagManagerOpen((current) => !current)}
          options={tags}
          selected={tagFilter}
          onSelect={setTagFilter}
        />
        {tagManagerOpen ? (
          <TagManager
            managedTags={managedTags}
            onAddTag={onAddTag}
            onDeleteTag={onDeleteTag}
            onRenameTag={onRenameTag}
          />
        ) : null}
        <div>
          <label className="mb-1 block text-xs font-bold text-zinc-500" htmlFor="sort">
            정렬
          </label>
          <select
            className={inputClass}
            id="sort"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option>최근 수정순</option>
            <option>최근 등록순</option>
            <option>이름순</option>
          </select>
        </div>
      </div>
    </aside>
  );
}

function TagManager({
  managedTags,
  onAddTag,
  onDeleteTag,
  onRenameTag,
}: {
  managedTags: Tag[];
  onAddTag: (tag: string) => void;
  onDeleteTag: (tagId: string) => void;
  onRenameTag: (tagId: string, next: string) => void;
}) {
  const [newTag, setNewTag] = useState('');
  const [editingTag, setEditingTag] = useState('');
  const [editingValue, setEditingValue] = useState('');

  function submitNewTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAddTag(newTag);
    setNewTag('');
  }

  function submitRename(event: FormEvent<HTMLFormElement>, tag: string) {
    event.preventDefault();
    onRenameTag(tag, editingValue);
    setEditingTag('');
    setEditingValue('');
  }

  return (
    <section className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div>
        <h3 className="text-xs font-bold text-zinc-700">태그 관리</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">여기서 등록한 태그만 기기 등록/수정에서 선택할 수 있습니다.</p>
      </div>

      <form className="mt-3 flex min-w-0 gap-2" onSubmit={submitNewTag}>
        <label className="sr-only" htmlFor="new-tag">
          새 태그
        </label>
        <input
          className={`${inputClass} min-w-0`}
          id="new-tag"
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          placeholder="새 태그"
        />
        <button className="h-10 shrink-0 rounded-lg bg-zinc-900 px-3 text-xs font-bold text-white" type="submit">
          추가
        </button>
      </form>

      <div className="mt-3 space-y-2">
        {managedTags.map((tag) =>
          editingTag === tag.id ? (
            <form className="flex min-w-0 gap-2" key={tag.id} onSubmit={(event) => submitRename(event, tag.id)}>
              <input
                className={`${inputClass} min-w-0`}
                value={editingValue}
                onChange={(event) => setEditingValue(event.target.value)}
                autoFocus
              />
              <button className="h-10 shrink-0 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white" type="submit">
                저장
              </button>
            </form>
          ) : (
            <div className="flex min-w-0 items-center gap-2 rounded-lg bg-white px-2 py-2" key={tag.id}>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-700">{tag.name}</span>
              <button
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900"
                type="button"
                onClick={() => {
                  setEditingTag(tag.id);
                  setEditingValue(tag.name);
                }}
              >
                수정
              </button>
              <button
                className="text-xs font-bold text-red-600 hover:text-red-800"
                type="button"
                onClick={() => onDeleteTag(tag.id)}
              >
                삭제
              </button>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function LocationManager({
  managedLocations,
  onAddLocation,
  onDeleteLocation,
  onRenameLocation,
}: {
  managedLocations: ManagedLocation[];
  onAddLocation: (location: string) => void;
  onDeleteLocation: (locationId: string) => void;
  onRenameLocation: (locationId: string, next: string) => void;
}) {
  const [newLocation, setNewLocation] = useState('');
  const [editingLocation, setEditingLocation] = useState('');
  const [editingValue, setEditingValue] = useState('');

  function submitNewLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAddLocation(newLocation);
    setNewLocation('');
  }

  function submitRename(event: FormEvent<HTMLFormElement>, locationId: string) {
    event.preventDefault();
    onRenameLocation(locationId, editingValue);
    setEditingLocation('');
    setEditingValue('');
  }

  return (
    <section className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div>
        <h3 className="text-xs font-bold text-zinc-700">위치 관리</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">등록한 위치는 필터와 기기 등록/수정 입력에서 함께 사용됩니다.</p>
      </div>

      <form className="mt-3 flex min-w-0 gap-2" onSubmit={submitNewLocation}>
        <label className="sr-only" htmlFor="new-location">
          새 위치
        </label>
        <input
          className={`${inputClass} min-w-0`}
          id="new-location"
          value={newLocation}
          onChange={(event) => setNewLocation(event.target.value)}
          placeholder="새 위치"
        />
        <button className="h-10 shrink-0 rounded-lg bg-zinc-900 px-3 text-xs font-bold text-white" type="submit">
          추가
        </button>
      </form>

      <div className="mt-3 space-y-2">
        {managedLocations.map((location) =>
          editingLocation === location.id ? (
            <form
              className="flex min-w-0 gap-2"
              key={location.id}
              onSubmit={(event) => submitRename(event, location.id)}
            >
              <input
                className={`${inputClass} min-w-0`}
                value={editingValue}
                onChange={(event) => setEditingValue(event.target.value)}
                autoFocus
              />
              <button className="h-10 shrink-0 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white" type="submit">
                저장
              </button>
            </form>
          ) : (
            <div className="flex min-w-0 items-center gap-2 rounded-lg bg-white px-2 py-2" key={location.id}>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-700">{location.name}</span>
              <button
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900"
                type="button"
                onClick={() => {
                  setEditingLocation(location.id);
                  setEditingValue(location.name);
                }}
              >
                수정
              </button>
              <button
                className="text-xs font-bold text-red-600 hover:text-red-800"
                type="button"
                onClick={() => onDeleteLocation(location.id)}
              >
                삭제
              </button>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function FilterGroup({
  label,
  managerOpen,
  onSelect,
  onToggleManager,
  options,
  selected,
}: {
  label: string;
  managerOpen?: boolean;
  onSelect: (value: string) => void;
  onToggleManager?: () => void;
  options: FilterOption[] | string[];
  selected: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <p className="text-xs font-bold text-zinc-500">{label}</p>
        {onToggleManager ? (
          <button
            className={`h-7 shrink-0 rounded-lg border px-2 text-xs font-bold transition ${
              managerOpen
                ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
            }`}
            type="button"
            onClick={onToggleManager}
            aria-expanded={managerOpen}
            aria-label={`${label} 관리 ${managerOpen ? '닫기' : '열기'}`}
            title={`${label} 관리`}
          >
            설정
          </button>
        ) : null}
      </div>
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
        {options.map((option) => {
          const value = typeof option === 'string' ? option : option.value;
          const labelText = typeof option === 'string' ? option : option.label;

          return (
            <button
              className={`h-8 shrink-0 rounded-lg border px-3 text-xs font-semibold transition ${
                selected === value
                  ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
              key={value}
              type="button"
              onClick={() => onSelect(value)}
            >
              {labelText}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DeviceList({
  devices,
  onCreate,
  onSelect,
  selectedId,
  total,
}: {
  devices: Device[];
  onCreate: () => void;
  onSelect: (id: string) => void;
  selectedId: string;
  total: number;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="flex min-w-0 flex-col gap-2 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-zinc-950">기기 목록</h2>
          <p className="text-sm text-zinc-500">
            {devices.length}개 표시 중, 전체 {total}개
          </p>
        </div>
        <div className="max-w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          동일 QR 또는 숫자 코드는 등록 시 경고로 표시됩니다.
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="flex min-h-96 flex-col items-center justify-center p-8 text-center">
          <h3 className="text-xl font-bold">검색 조건과 일치하는 기기가 없습니다.</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
            필터를 초기화하거나 새 Matter 기기를 등록해 목록에 추가해 보세요.
          </p>
          <button className={`${buttonPrimary} mt-5`} type="button" onClick={onCreate}>
            새 기기 등록
          </button>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {devices.map((device) => (
            <button
              className={`block w-full p-4 text-left transition hover:bg-zinc-50 ${
                selectedId === device.id ? 'bg-emerald-50/70' : 'bg-white'
              }`}
              key={device.id}
              type="button"
              onClick={() => onSelect(device.id)}
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-zinc-950">{device.alias}</h3>
                    <span className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
                      {device.location}
                    </span>
                  </div>
                  <p className="mt-2 break-all font-mono text-xs text-zinc-500">{device.qrPayload}</p>
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  {device.tags.map((tag) => (
                    <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800" key={tag.id}>
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
                <span>숫자 코드 {maskCode(device.numericCode)}</span>
                <span>{device.manufacturer}</span>
                <span>수정 {device.updatedAt}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function DeviceDetail({
  device,
  onCopy,
  onDelete,
  onEdit,
}: {
  device: Device;
  onCopy: (label: string, value: string) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-zinc-950">{device.alias}</h2>
        </div>
        <span className="max-w-28 shrink-0 truncate rounded-lg bg-zinc-100 px-2 py-1 text-xs font-bold text-zinc-600">
          {device.location}
        </span>
      </div>

      <QrCodeDisplay value={device.qrPayload} />

      <div className="mt-4 space-y-3">
        <CopyRow label="QR 인식값" value={device.qrPayload} onCopy={onCopy} />
        <CopyRow label="숫자 코드" value={device.numericCode} onCopy={onCopy} />
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <Info label="제조사" value={device.manufacturer} />
        <Info label="모델" value={device.model} />
        <Info label="등록" value={device.createdAt} />
        <Info label="수정" value={device.updatedAt} />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {device.tags.map((tag) => (
          <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800" key={tag.id}>
            {tag.name}
          </span>
        ))}
      </div>

      <p className="mt-4 break-words rounded-lg bg-zinc-50 p-3 text-sm leading-6 text-zinc-600">{device.notes}</p>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button className={buttonSecondary} type="button" onClick={onEdit}>
          수정
        </button>
        <button className={buttonDanger} type="button" onClick={onDelete}>
          삭제
        </button>
      </div>
    </section>
  );
}

function DeviceFormView({
  duplicateDevice,
  form,
  managedLocations,
  managedTags,
  manufacturerOptions,
  mode,
  onCancel,
  onScanResult,
  onScanState,
  onSubmit,
  scanState,
  toggleFormTag,
  updateForm,
}: {
  duplicateDevice?: Device;
  form: DeviceForm;
  managedLocations: ManagedLocation[];
  managedTags: Tag[];
  manufacturerOptions: string[];
  mode: View;
  onCancel: () => void;
  onScanResult: (value: string) => void;
  onScanState: (state: ScanState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  scanState: ScanState;
  toggleFormTag: (tagId: string) => void;
  updateForm: (field: keyof DeviceForm, value: string) => void;
}) {
  const isEdit = mode === 'edit';
  const [scannerOpen, setScannerOpen] = useState(false);

  function handleModalScanResult(value: string) {
    onScanResult(value);
    setScannerOpen(false);
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-5 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-zinc-950">{isEdit ? '기기 수정' : '새 기기 등록'}</h2>
          <p className="text-sm text-zinc-500">저장하면 기기 목록과 상세 정보에 바로 반영됩니다.</p>
        </div>
        <button className={buttonSecondary} type="button" onClick={onCancel}>
          목록으로
        </button>
      </div>

      <form className="min-w-0 space-y-4" onSubmit={onSubmit}>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <TextField label="기기 별명" value={form.alias} onChange={(value) => updateForm('alias', value)} required />
          <QrPayloadField
            value={form.qrPayload}
            onChange={(value) => updateForm('qrPayload', value)}
            onOpenScanner={() => {
              onScanState('idle');
              setScannerOpen(true);
            }}
          />
          <TextField
            label="숫자 코드"
            value={form.numericCode}
            onChange={(value) => updateForm('numericCode', value)}
            required
          />
          <TextField
            label="제조사"
            value={form.manufacturer}
            onChange={(value) => updateForm('manufacturer', value)}
            options={manufacturerOptions}
            placeholder="제조사 입력 또는 선택"
          />
          <TextField label="모델" value={form.model} onChange={(value) => updateForm('model', value)} />
          <SelectField
            label="위치"
            value={form.location}
            onChange={(value) => updateForm('location', value)}
            options={managedLocations.map((location) => location.name)}
            placeholder="위치 선택"
          />
        </div>
        <TagBinder managedTags={managedTags} selectedTagIds={form.tagIds} onToggleTag={toggleFormTag} />
        <div>
          <label className="mb-1 block text-sm font-semibold text-zinc-800" htmlFor="notes">
            메모
          </label>
          <textarea
            className="min-h-24 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            id="notes"
            value={form.notes}
            onChange={(event) => updateForm('notes', event.target.value)}
            placeholder="설치 위치, 재페어링 힌트, 기타 메모"
          />
        </div>

        {duplicateDevice ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            {duplicateDevice.alias}와 QR 또는 숫자 코드가 중복될 수 있습니다.
          </p>
        ) : null}

        {isEdit ? (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800">
            QR 인식값과 숫자 코드 변경은 저장 전 다시 확인해 주세요.
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button className={buttonPrimary} type="submit">
            {isEdit ? '수정 저장' : '등록 저장'}
          </button>
          <button className={buttonSecondary} type="button" onClick={onCancel}>
            취소
          </button>
        </div>
      </form>

      {scannerOpen ? (
        <QrScannerDialog
          onClose={() => {
            onScanState('idle');
            setScannerOpen(false);
          }}
          onScanResult={handleModalScanResult}
          onScanState={onScanState}
          qrPayload={form.qrPayload}
          scanState={scanState}
        />
      ) : null}
    </section>
  );
}

function QrPayloadField({
  onChange,
  onOpenScanner,
  value,
}: {
  onChange: (value: string) => void;
  onOpenScanner: () => void;
  value: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-zinc-800" htmlFor="QR-인식값">
        QR 인식값 <span className="text-red-600">*</span>
      </label>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <input
          className={`${inputClass} min-w-0`}
          id="QR-인식값"
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button className={`${buttonSecondary} shrink-0 sm:w-auto`} type="button" onClick={onOpenScanner}>
          카메라 스캔
        </button>
      </div>
    </div>
  );
}

function QrScannerDialog({
  onClose,
  onScanResult,
  onScanState,
  qrPayload,
  scanState,
}: {
  onClose: () => void;
  onScanResult: (value: string) => void;
  onScanState: (state: ScanState) => void;
  qrPayload: string;
  scanState: ScanState;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-zinc-950/50 p-4">
      <section className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-zinc-950">QR 코드 스캔</h2>
            <p className="text-sm text-zinc-500">스캔이 완료되면 QR 인식값에 자동 입력됩니다.</p>
          </div>
          <button
            aria-label="QR 스캔 닫기"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2"
            title="닫기"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} strokeWidth={2.4} />
          </button>
        </div>
        <ScanPanel
          scanState={scanState}
          onScanResult={onScanResult}
          onScanState={onScanState}
          qrPayload={qrPayload}
        />
      </section>
    </div>
  );
}

function TagBinder({
  managedTags,
  onToggleTag,
  selectedTagIds,
}: {
  managedTags: Tag[];
  onToggleTag: (tagId: string) => void;
  selectedTagIds: string[];
}) {
  return (
    <section className="min-w-0 rounded-lg border border-zinc-200 p-3">
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-800">태그 바인딩</h3>
          <p className="text-xs text-zinc-500">좌측 태그 관리에서 등록된 태그를 선택합니다.</p>
        </div>
        <span className="text-xs font-bold text-emerald-700">{selectedTagIds.length}개 선택</span>
      </div>

      {managedTags.length === 0 ? (
        <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500">
          등록된 태그가 없습니다. 좌측 필터의 태그 관리에서 먼저 태그를 추가해 주세요.
        </p>
      ) : (
        <div className="mt-3 flex min-w-0 flex-wrap gap-2">
          {managedTags.map((tag) => {
            const checked = selectedTagIds.includes(tag.id);

            return (
              <label
                className={`inline-flex max-w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  checked
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
                key={tag.id}
              >
                <input
                  checked={checked}
                  className="h-4 w-4 accent-emerald-700"
                  type="checkbox"
                  onChange={() => onToggleTag(tag.id)}
                />
                {tag.name}
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ScanPanel({
  onScanResult,
  onScanState,
  qrPayload,
  scanState,
}: {
  onScanResult: (value: string) => void;
  onScanState: (state: ScanState) => void;
  qrPayload: string;
  scanState: ScanState;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const messageByState: Record<ScanState, string> = {
    idle: '카메라 스캔을 시작하면 QR 인식값이 자동 입력됩니다.',
    requesting: '카메라 화면에서 QR 코드를 찾고 있습니다.',
    success: '스캔 성공: 등록 폼에 적용됨',
    denied: '카메라 접근이 거부되었습니다. 닫기 후 QR 인식값을 직접 입력해 주세요.',
    blocked: '브라우저 또는 페이지 정책에서 카메라 사용이 차단되었습니다. 주소창의 사이트 권한과 배포 헤더를 확인해 주세요.',
    unsupported: '이 브라우저에서는 카메라 QR 스캔을 시작할 수 없습니다. 닫기 후 QR 인식값을 직접 입력해 주세요.',
    insecure: '카메라 스캔은 HTTPS 또는 localhost에서 사용할 수 있습니다.',
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function stopCamera() {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startCameraScan() {
    stopCamera();

    if (!window.isSecureContext) {
      onScanState('insecure');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      onScanState('unsupported');
      return;
    }

    const permissionState = await getCameraPermissionState();

    if (permissionState === 'denied') {
      onScanState('denied');
      return;
    }

    onScanState('requesting');

    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const codeReader = new BrowserQRCodeReader();
      const controls = await codeReader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
          },
          audio: false,
        },
        videoRef.current,
        (result, _error, controls) => {
          const rawValue = result?.getText();

          if (rawValue) {
            controls.stop();
            scannerControlsRef.current = null;
            onScanResult(rawValue);
          }
        },
      );

      scannerControlsRef.current = controls;
    } catch (error) {
      stopCamera();
      const isPermissionError =
        error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      onScanState(isPermissionError ? 'blocked' : 'unsupported');
    }
  }

  return (
    <aside className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <h3 className="text-sm font-bold text-zinc-950">카메라 QR 스캔</h3>
      <div className="relative mt-3 aspect-square overflow-hidden rounded-lg bg-zinc-950 text-center text-sm text-zinc-300">
        <video
          ref={videoRef}
          className={`h-full w-full object-cover ${scanState === 'requesting' ? 'opacity-80' : 'opacity-20'}`}
          muted
          playsInline
        />
        <div className="absolute inset-5 flex items-center justify-center rounded-lg border-2 border-dashed border-emerald-400/80">
          <span className="rounded-lg bg-zinc-950/80 px-3 py-2">
            {scanState === 'requesting' ? 'QR 코드를 프레임 안에 맞춰 주세요' : '카메라 프리뷰 영역'}
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{messageByState[scanState]}</p>
      {qrPayload ? <p className="mt-2 break-all font-mono text-xs text-zinc-500">{qrPayload}</p> : null}
      <div className="mt-4 grid gap-2">
        <button className={buttonPrimary} type="button" onClick={startCameraScan}>
          {scanState === 'requesting' ? '스캔 중' : '카메라로 실제 스캔'}
        </button>
        <button
          className={buttonSecondary}
          type="button"
          onClick={() => {
            stopCamera();
            onScanState('idle');
          }}
        >
          중지
        </button>
      </div>
    </aside>
  );
}

async function getCameraPermissionState() {
  if (!navigator.permissions?.query) return null;

  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state;
  } catch {
    return null;
  }
}

function TextField({
  label,
  onChange,
  options,
  placeholder,
  required,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  value: string;
}) {
  const id = label.replace(/\s+/g, '-');
  const listId = options?.length ? `${id}-options` : undefined;

  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-zinc-800" htmlFor={id}>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      <input
        className={inputClass}
        id={id}
        list={listId}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {listId ? (
        <datalist id={listId}>
          {options?.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}

function SelectField({
  label,
  onChange,
  options,
  placeholder,
  required,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  value: string;
}) {
  const id = label.replace(/\s+/g, '-');
  const normalizedOptions = Array.from(new Set(options.filter(Boolean)));
  const optionsWithCurrent =
    value && !normalizedOptions.includes(value) ? [value, ...normalizedOptions] : normalizedOptions;

  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-zinc-800" htmlFor={id}>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      <select
        className={inputClass}
        id={id}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder ?? '선택 안 함'}</option>
        {optionsWithCurrent.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function CopyRow({
  label,
  onCopy,
  value,
}: {
  label: string;
  onCopy: (label: string, value: string) => void;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-zinc-500">{label}</p>
        <button
          className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
          type="button"
          onClick={() => onCopy(label, value)}
        >
          복사
        </button>
      </div>
      <p className="mt-2 break-all font-mono text-sm text-zinc-800">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-zinc-500">{label}</dt>
      <dd className="mt-1 break-all text-sm font-semibold text-zinc-800">{value || '-'}</dd>
    </div>
  );
}

function QrCodeDisplay({ value }: { value: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.replaceChildren();
    setHasError(false);

    if (!value) return;

    try {
      const writer = new BrowserQRCodeSvgWriter();
      const svg = writer.write(value, 240, 240);
      svg.setAttribute('aria-label', 'Matter QR 코드');
      svg.setAttribute('class', 'h-full w-full');
      svg.setAttribute('role', 'img');
      svg.setAttribute('shape-rendering', 'crispEdges');
      container.appendChild(svg);
    } catch {
      setHasError(true);
    }
  }, [value]);

  return (
    <div className="mt-5 rounded-lg border border-zinc-200 bg-white p-4">
      <div
        className={`mx-auto aspect-square w-full max-w-60 rounded-lg bg-white ${hasError ? 'hidden' : ''}`}
        ref={containerRef}
      />
      {hasError ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          QR 인식값이 너무 길어 QR 코드로 표시할 수 없습니다.
        </p>
      ) : null}
      <p className="mt-3 text-center text-xs font-medium text-zinc-500">저장된 QR 인식값을 실제 QR 코드로 표시합니다.</p>
    </div>
  );
}

function EmptyDetail({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 text-center">
      <h2 className="text-lg font-bold text-zinc-950">선택된 기기가 없습니다.</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500">새 기기를 등록하거나 검색 조건을 바꿔 보세요.</p>
      <button className={`${buttonPrimary} mt-5`} type="button" onClick={onCreate}>
        새 기기 등록
      </button>
    </section>
  );
}

function DeleteDialog({
  device,
  onCancel,
  onConfirm,
}: {
  device: Device;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-zinc-950/40 p-4 sm:items-center sm:justify-center">
      <section className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-950">기기를 삭제할까요?</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          {device.alias} 항목이 목록에서 제거됩니다.
        </p>
        <p className="mt-3 rounded-lg bg-zinc-50 p-3 font-mono text-xs text-zinc-600">숫자 코드 {maskCode(device.numericCode)}</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button className={buttonSecondary} type="button" onClick={onCancel}>
            취소
          </button>
          <button className={buttonDanger} type="button" onClick={onConfirm}>
            삭제
          </button>
        </div>
      </section>
    </div>
  );
}

function ExportDialog({
  count,
  onClose,
  onExport,
}: {
  count: number;
  onClose: () => void;
  onExport: (format: 'JSON' | 'CSV') => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-zinc-950/40 p-4 sm:items-center sm:justify-center">
      <section className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-950">백업 내보내기</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          {count}개 기기를 내보내는 것처럼 동작합니다. 실제 파일 생성은 아직 연결하지 않습니다.
        </p>
        <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
          운영 DB 경로는 서버 환경변수 `MATTER_SQLITE_PATH`, 인증 비밀값은 `AUTH_SECRET`로 관리하는 전제입니다.
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <button className={buttonPrimary} type="button" onClick={() => onExport('JSON')}>
            JSON
          </button>
          <button className={buttonSecondary} type="button" onClick={() => onExport('CSV')}>
            CSV
          </button>
          <button className={buttonSecondary} type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </section>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-5 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-lg">
      {message}
    </div>
  );
}

function maskCode(value: string) {
  if (value.length <= 4) return value;
  return `${value.slice(0, 3)}...${value.slice(-4)}`;
}
