'use client'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, X } from 'lucide-react'
import type { CalEvent } from './GCalAgenda'

const TZ = 'America/Sao_Paulo'

interface Props {
  open: boolean
  defaultDate?: Date
  event?: CalEvent | null // quando presente, modo edição de um evento do Google
  onClose: () => void
  onSaved: () => void
}

export function EventModal({ open, defaultDate, event, onClose, onSaved }: Props) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [guests, setGuests] = useState('')
  const [withMeet, setWithMeet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (event) {
      setTitle(event.title)
      setDate(format(event.start, 'yyyy-MM-dd'))
      setAllDay(!!event.allDay)
      setStartTime(format(event.start, 'HH:mm'))
      setEndTime(format(event.end, 'HH:mm'))
      setLocation(event.location ?? '')
      setDescription(event.description ?? '')
      setGuests('')
      setWithMeet(false)
    } else {
      const d = defaultDate ?? new Date()
      setTitle('')
      setDate(format(d, 'yyyy-MM-dd'))
      const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0
      const h = hasTime ? d.getHours() : 9
      setStartTime(`${String(h).padStart(2, '0')}:00`)
      setEndTime(`${String(Math.min(h + 1, 23)).padStart(2, '0')}:00`)
      setAllDay(false)
      setLocation('')
      setDescription('')
      setGuests('')
      setWithMeet(false)
    }
  }, [open, event, defaultDate])

  if (!open) return null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) return
    setSaving(true)
    setError('')
    try {
      const body: any = { summary: title.trim(), location: location.trim() || undefined, description: description.trim() || undefined }
      if (allDay) {
        const next = new Date(`${date}T00:00:00`)
        next.setDate(next.getDate() + 1)
        body.start = { date }
        body.end = { date: format(next, 'yyyy-MM-dd') }
      } else {
        if (endTime <= startTime) { setError('O horário final precisa ser depois do inicial.'); setSaving(false); return }
        body.start = { dateTime: new Date(`${date}T${startTime}:00`).toISOString(), timeZone: TZ }
        body.end = { dateTime: new Date(`${date}T${endTime}:00`).toISOString(), timeZone: TZ }
      }
      const emails = guests.split(/[,\s;]+/).map(g => g.trim()).filter(Boolean)
      if (emails.length) body.attendees = emails.map(email => ({ email }))
      if (event?.googleId) {
        await api.patch(`/agenda/events/${event.googleId}`, body)
      } else {
        body.withMeet = withMeet
        await api.post('/agenda/events', body)
      }
      onSaved()
      onClose()
    } catch {
      setError('Não foi possível salvar o evento. Confira os dados e tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{event ? 'Editar evento' : 'Novo evento'}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-1">
          <Label>Título</Label>
          <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Reunião com cliente" required />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-3 sm:col-span-1 space-y-1">
            <Label>Data</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          {!allDay && (
            <>
              <div className="space-y-1"><Label>Início</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
              <div className="space-y-1"><Label>Fim</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
            </>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} /> Dia inteiro</label>
        <div className="space-y-1"><Label>Local</Label><Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Endereço ou link" /></div>
        <div className="space-y-1"><Label>Convidados (e-mails, separados por vírgula)</Label><Input value={guests} onChange={e => setGuests(e.target.value)} placeholder="cliente@email.com" /></div>
        <div className="space-y-1"><Label>Descrição</Label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </div>
        {!event && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withMeet} onChange={e => setWithMeet(e.target.checked)} /> Criar sala do Google Meet</label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving} className="bg-[#1565C0] hover:bg-[#0D47A1]">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
          </Button>
        </div>
      </form>
    </div>
  )
}
