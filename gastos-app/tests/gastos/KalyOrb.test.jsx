import { render, screen, fireEvent } from '@testing-library/react';
import KalyOrb from '../../src/gastos/kaly/KalyOrb.jsx';

test('renders with state "off" — container has data-state="off" and label Kaly', () => {
  render(<KalyOrb state="off" audioLevel={0} onTap={() => {}} />);

  const btn = screen.getByRole('button', { name: 'Kaly' });
  expect(btn).toBeInTheDocument();
  expect(btn).toHaveAttribute('data-state', 'off');
  expect(screen.getByText('Kaly')).toBeInTheDocument();
});

test('click fires onTap callback', () => {
  const onTap = jest.fn();
  render(<KalyOrb state="off" audioLevel={0} onTap={onTap} />);

  fireEvent.click(screen.getByRole('button', { name: 'Kaly' }));
  expect(onTap).toHaveBeenCalledTimes(1);
});

test('re-render with state "speaking" updates data-state', () => {
  const { rerender } = render(
    <KalyOrb state="off" audioLevel={0} onTap={() => {}} />,
  );

  rerender(<KalyOrb state="speaking" audioLevel={0.5} onTap={() => {}} />);

  const btn = screen.getByRole('button', { name: 'Kaly' });
  expect(btn).toHaveAttribute('data-state', 'speaking');
});
