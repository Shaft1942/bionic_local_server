import { mount } from 'svelte';
import './app.css';
import './lib/companion/companion.css';
import App from './lib/companion/App.svelte';

mount(App, { target: document.getElementById('app')! });
