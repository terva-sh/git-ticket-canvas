import { useEffect, useState } from 'preact/hooks'

export interface Feedback { id: number; message: string; error: boolean }
export function FeedbackMessage({ feedback }: { feedback: Feedback | null }) {
  const [visible, setVisible] = useState(feedback?.id)
  useEffect(() => {
    setVisible(feedback?.id)
    if (!feedback) return
    const timer = setTimeout(() => setVisible(undefined), feedback.error ? 5200 : 2600)
    return () => clearTimeout(timer)
  }, [feedback])
  return <div id="toast" role={feedback?.error ? 'alert' : 'status'} class={(feedback && visible === feedback.id ? 'show' : '') + (feedback?.error ? ' err' : '')}>{feedback?.message}</div>
}
