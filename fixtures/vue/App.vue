<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

const values = reactive({ name: '', email: '', plan: 'free', newsletter: false, frequency: '', country: 'sg', bio: '' });
const submitted = ref<typeof values>();
const ready = ref(false);

onMounted(() => setTimeout(() => (ready.value = true), 400));
</script>

<template>
  <p v-if="!ready">Loading…</p>
  <form v-else id="signup" @submit.prevent="submitted = { ...values }">
    <label>Name <input v-model="values.name" name="name" /></label>
    <label>Email <input v-model="values.email" name="email" type="email" /></label>
    <!-- .lazy listens to `change` instead of `input`; restore fires both. -->
    <label>Bio (v-model.lazy) <textarea v-model.lazy="values.bio" name="bio" /></label>
    <fieldset>
      <legend>Plan</legend>
      <label v-for="plan in ['free', 'pro']" :key="plan">
        <input v-model="values.plan" type="radio" name="plan" :value="plan" /> {{ plan }}
      </label>
    </fieldset>
    <label><input v-model="values.newsletter" type="checkbox" name="newsletter" /> Newsletter</label>
    <label v-if="values.newsletter">
      Frequency
      <select v-model="values.frequency" name="frequency">
        <option value="">Choose…</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </label>
    <label>
      Country
      <select v-model="values.country" name="country">
        <option value="sg">Singapore</option>
        <option value="id">Indonesia</option>
      </select>
    </label>
    <button type="submit">Submit</button>
    <h2>Vue state</h2>
    <output data-testid="state">{{ JSON.stringify(values, null, 2) }}</output>
    <template v-if="submitted">
      <h2>Submitted</h2>
      <output data-testid="submitted">{{ JSON.stringify(submitted, null, 2) }}</output>
    </template>
  </form>
</template>
