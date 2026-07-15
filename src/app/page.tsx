export default function Home() {
  return (
    <main>
      <h1>fapy-hook</h1>
      <p>Yearn estimated APR webhook service.</p>
      <ul>
        <li>
          <code>POST /webhook</code> — Kong batch fAPY computation
        </li>
        <li>
          <code>GET /healthcheck</code> — health probe
        </li>
      </ul>
    </main>
  );
}
