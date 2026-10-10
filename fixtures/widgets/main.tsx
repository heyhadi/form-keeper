import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions, Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import * as RadixSelect from '@radix-ui/react-select';
import { DatePicker as AntDatePicker, Select as AntSelect, Switch as AntSwitch } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import ReactDatePicker from 'react-datepicker';
import ReactSelect from 'react-select';
import MuiAutocomplete from '@mui/material/Autocomplete';
import MuiMenuItem from '@mui/material/MenuItem';
import MuiSelect from '@mui/material/Select';
import MuiTextField from '@mui/material/TextField';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateField as MuiDateField } from '@mui/x-date-pickers/DateField';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import 'react-datepicker/dist/react-datepicker.css';
import 'antd/dist/reset.css';

const CITIES = ['Singapore', 'Jakarta', 'Kuala Lumpur', 'Bangkok'];
const OPTIONS = CITIES.map((c) => ({ value: c.toLowerCase().replace(/ /g, '-'), label: c }));

function Field({ label, children }: { label: string; children: ReactNode }) {
  // Deliberately no htmlFor: real apps often don't wire labels to widgets.
  return (
    <div className="widget-field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function App() {
  const [rsSingle, setRsSingle] = useState<(typeof OPTIONS)[number] | null>(null);
  const [rsMulti, setRsMulti] = useState<readonly (typeof OPTIONS)[number][]>([]);
  const [antSingle, setAntSingle] = useState<string>();
  const [antMulti, setAntMulti] = useState<string[]>([]);
  const [antDate, setAntDate] = useState<Dayjs | null>(null);
  const [antOn, setAntOn] = useState(false);
  const [muiSelect, setMuiSelect] = useState('');
  const [muiAuto, setMuiAuto] = useState<string | null>(null);
  const [muiDate, setMuiDate] = useState<Dayjs | null>(null);
  const [radix, setRadix] = useState('');
  const [headless, setHeadless] = useState('');
  const [hCombo, setHCombo] = useState<string | null>(null);
  const [rdp, setRdp] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');

  const state = {
    rsSingle: rsSingle?.label ?? null,
    rsMulti: rsMulti.map((o) => o.label),
    antSingle: OPTIONS.find((o) => o.value === antSingle)?.label ?? null,
    antMulti: antMulti.map((v) => OPTIONS.find((o) => o.value === v)?.label),
    antDate: antDate?.format('YYYY-MM-DD') ?? null,
    antOn,
    muiSelect,
    muiAuto,
    muiDate: muiDate?.format('YYYY-MM-DD') ?? null,
    radix,
    headless,
    hCombo,
    rdp: rdp ? `${rdp.getFullYear()}-${String(rdp.getMonth() + 1).padStart(2, '0')}-${String(rdp.getDate()).padStart(2, '0')}` : null,
    notes,
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <form id="widgets" onSubmit={(e) => e.preventDefault()}>
        <Field label="React Select (single)">
          <ReactSelect options={OPTIONS} value={rsSingle} onChange={setRsSingle} />
        </Field>
        <Field label="React Select (multi)">
          <ReactSelect isMulti options={OPTIONS} value={rsMulti} onChange={setRsMulti} />
        </Field>
        <Field label="Ant Select (single)">
          <AntSelect style={{ width: '100%' }} options={OPTIONS} value={antSingle} onChange={setAntSingle} />
        </Field>
        <Field label="Ant Select (multiple)">
          <AntSelect mode="multiple" style={{ width: '100%' }} options={OPTIONS} value={antMulti} onChange={setAntMulti} />
        </Field>
        <Field label="Ant DatePicker">
          <AntDatePicker value={antDate} onChange={setAntDate} />
        </Field>
        <Field label="Ant Switch">
          <AntSwitch checked={antOn} onChange={setAntOn} />
        </Field>
        <Field label="MUI Select">
          <MuiSelect fullWidth size="small" value={muiSelect} displayEmpty onChange={(e) => setMuiSelect(e.target.value)}>
            <MuiMenuItem value="">None</MuiMenuItem>
            {CITIES.map((c) => (
              <MuiMenuItem key={c} value={c}>
                {c}
              </MuiMenuItem>
            ))}
          </MuiSelect>
        </Field>
        <Field label="MUI Autocomplete">
          <MuiAutocomplete size="small" options={CITIES} value={muiAuto} onChange={(_, v) => setMuiAuto(v)} renderInput={(params) => <MuiTextField {...params} />} />
        </Field>
        <Field label="MUI DateField (segmented)">
          <MuiDateField size="small" value={muiDate} onChange={setMuiDate} format="DD/MM/YYYY" />
        </Field>
        <Field label="Radix Select">
          <RadixSelect.Root value={radix} onValueChange={setRadix}>
            <RadixSelect.Trigger className="trigger">
              <RadixSelect.Value placeholder="Choose…" />
            </RadixSelect.Trigger>
            <RadixSelect.Portal>
              <RadixSelect.Content className="popup-list" position="popper">
                <RadixSelect.Viewport>
                  {CITIES.map((c) => (
                    <RadixSelect.Item key={c} value={c} className="popup-item">
                      <RadixSelect.ItemText>{c}</RadixSelect.ItemText>
                    </RadixSelect.Item>
                  ))}
                </RadixSelect.Viewport>
              </RadixSelect.Content>
            </RadixSelect.Portal>
          </RadixSelect.Root>
        </Field>
        <Field label="Headless UI Listbox">
          <Listbox value={headless} onChange={setHeadless}>
            <ListboxButton className="trigger">{headless || 'Choose…'}</ListboxButton>
            <ListboxOptions anchor="bottom start" className="popup-list">
              {CITIES.map((c) => (
                <ListboxOption key={c} value={c} className="popup-item">
                  {c}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </Listbox>
        </Field>
        <Field label="Headless UI Combobox">
          <Combobox value={hCombo} onChange={setHCombo}>
            <div className="combo">
              <ComboboxInput className="trigger" displayValue={(v: string | null) => v ?? ''} />
              <ComboboxButton>▾</ComboboxButton>
            </div>
            <ComboboxOptions anchor="bottom start" className="popup-list">
              {CITIES.map((c) => (
                <ComboboxOption key={c} value={c} className="popup-item">
                  {c}
                </ComboboxOption>
              ))}
            </ComboboxOptions>
          </Combobox>
        </Field>
        <Field label="react-datepicker">
          <ReactDatePicker selected={rdp} onChange={setRdp} dateFormat="dd/MM/yyyy" />
        </Field>
        <Field label="Notes (contenteditable)">
          <div className="editable" contentEditable suppressContentEditableWarning role="textbox" aria-label="Notes" onInput={(e) => setNotes((e.target as HTMLElement).innerText)} />
        </Field>
        <h2>State</h2>
        <output data-testid="state">{JSON.stringify(state, null, 2)}</output>
      </form>
    </LocalizationProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
