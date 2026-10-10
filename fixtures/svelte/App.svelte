<script lang="ts">
  let values = $state({ name: '', email: '', plan: 'free', newsletter: false, frequency: '', country: 'sg' });
  let submitted = $state<typeof values>();
  let ready = $state(false);

  $effect(() => {
    const timer = setTimeout(() => (ready = true), 400);
    return () => clearTimeout(timer);
  });

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    submitted = { ...values };
  }
</script>

{#if !ready}
  <p>Loading…</p>
{:else}
  <form id="signup" {onsubmit}>
    <label>Name <input bind:value={values.name} name="name" /></label>
    <label>Email <input bind:value={values.email} name="email" type="email" /></label>
    <fieldset>
      <legend>Plan</legend>
      {#each ['free', 'pro'] as plan (plan)}
        <label><input bind:group={values.plan} type="radio" name="plan" value={plan} /> {plan}</label>
      {/each}
    </fieldset>
    <label><input bind:checked={values.newsletter} type="checkbox" name="newsletter" /> Newsletter</label>
    {#if values.newsletter}
      <label>
        Frequency
        <select bind:value={values.frequency} name="frequency">
          <option value="">Choose…</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
    {/if}
    <label>
      Country
      <select bind:value={values.country} name="country">
        <option value="sg">Singapore</option>
        <option value="id">Indonesia</option>
      </select>
    </label>
    <button type="submit">Submit</button>
    <h2>Svelte state</h2>
    <output data-testid="state">{JSON.stringify(values, null, 2)}</output>
    {#if submitted}
      <h2>Submitted</h2>
      <output data-testid="submitted">{JSON.stringify(submitted, null, 2)}</output>
    {/if}
  </form>
{/if}
