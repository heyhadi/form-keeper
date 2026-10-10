<script lang="ts">
  import Select from 'svelte-select';

  const providers = ['Geotab', 'Cartrack', 'Webfleet', 'Samsara'];
  const models = ['318i', '320d', 'X1'];
  const fuels = ['Diesel', 'Electric', 'Hybrid', 'LPG', 'Petrol'];

  let provider = $state<{ value: string; label: string } | undefined>();
  let model = $state<{ value: string; label: string } | undefined>();
  let fuelTypes = $state<string[]>([]);
  let single = $state<string | null>(null);

  const toItems = (labels: string[]) => labels.map((l) => ({ value: l.toLowerCase(), label: l }));
  const toggle = (f: string) => (fuelTypes = fuelTypes.includes(f) ? fuelTypes.filter((x) => x !== f) : [...fuelTypes, f]);

  const state = $derived({ provider: provider?.label ?? null, model: model?.label ?? null, fuelTypes: [...fuelTypes].sort(), single });
</script>

<form id="car" onsubmit={(e) => e.preventDefault()}>
  <div class="col-6">
    <label for="telemetryProvider" class="d-block mb-1">Telematics provider*</label>
    <div class="dropdown-chevron-wrapper">
      <Select inputAttributes={{ id: 'telemetryProvider' }} items={toItems(providers)} bind:value={provider} placeholder="Select telematics provider" searchable={false} class="getgo select" />
    </div>
  </div>
  <div class="col-6">
    <label for="carModel" class="d-block mb-1">Car Model*</label>
    <div class="dropdown-chevron-wrapper">
      <Select inputAttributes={{ id: 'carModel' }} items={toItems(models)} bind:value={model} placeholder="Select model" class="getgo select" />
    </div>
  </div>

  <div class="col-6">
    <label class="d-block mb-1">Fuel Type*</label>
    <div class="chips">
      {#each fuels as fuel (fuel)}
        <button type="button" class="chip" class:chip-on={fuelTypes.includes(fuel)} onclick={() => toggle(fuel)}>{fuel}</button>
      {/each}
    </div>
  </div>

  <div class="col-6">
    <label class="d-block mb-1">Transmission*</label>
    <div class="chips">
      {#each ['Auto', 'Manual'] as t (t)}
        <button type="button" class="chip" class:chip-on={single === t} onclick={() => (single = t)}>{t}</button>
      {/each}
    </div>
  </div>

  <h2>State</h2>
  <output data-testid="state">{JSON.stringify(state)}</output>
</form>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { padding: 8px 14px; border: 1px solid #bbb; border-radius: 6px; background: #fff; color: #111; cursor: pointer; }
  .chip-on { background: #4ade9a; border-color: #2bbd7e; }
  .col-6 { max-width: 420px; }
</style>
