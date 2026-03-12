import type { CSSProperties } from 'react';

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>{title}</h1>
      <p style={styles.description}>
        {description ?? `The ${title} module is coming soon.`}
      </p>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    padding: '32px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#333',
    marginBottom: '12px',
  },
  description: {
    fontSize: '15px',
    color: '#888',
    lineHeight: 1.6,
  },
};
