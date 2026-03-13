import { useState } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useGetCities, useCreateCity, useDeleteCity, useGetServices, useCreateService, useDeleteService } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, MapPin, Wrench } from "lucide-react";

export default function Settings() {
  const queryClient = useQueryClient();
  const { data: cities } = useGetCities();
  const { data: services } = useGetServices();

  const [newCity, setNewCity] = useState("");
  const [newService, setNewService] = useState("");

  const createCityMutation = useCreateCity({ onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/cities"] }); setNewCity(""); }});
  const deleteCityMutation = useDeleteCity({ onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings/cities"] })});
  
  const createServiceMutation = useCreateService({ onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/services"] }); setNewService(""); }});
  const deleteServiceMutation = useDeleteService({ onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings/services"] })});

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Настройки</h1>
            <p className="text-muted-foreground mt-1">Справочники и системные параметры</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Cities */}
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6 border-b border-border/50 flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl"><MapPin className="w-5 h-5 text-primary" /></div>
                <h2 className="font-display font-bold text-lg">Города</h2>
              </div>
              <div className="p-6 flex-1 overflow-y-auto">
                <form 
                  onSubmit={e => { e.preventDefault(); if (newCity) createCityMutation.mutate({ data: { name: newCity } }); }}
                  className="flex gap-2 mb-6"
                >
                  <input 
                    value={newCity} onChange={e => setNewCity(e.target.value)}
                    placeholder="Новый город..."
                    className="flex-1 px-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                  <button disabled={createCityMutation.isPending || !newCity} className="px-4 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50">
                    <Plus className="w-5 h-5" />
                  </button>
                </form>
                
                <div className="space-y-2">
                  {cities?.map(city => (
                    <div key={city.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="font-medium text-slate-700">{city.name}</span>
                      <button 
                        onClick={() => deleteCityMutation.mutate({ id: city.id })}
                        className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Services */}
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6 border-b border-border/50 flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-xl"><Wrench className="w-5 h-5 text-amber-500" /></div>
                <h2 className="font-display font-bold text-lg">Услуги</h2>
              </div>
              <div className="p-6 flex-1 overflow-y-auto">
                <form 
                  onSubmit={e => { e.preventDefault(); if (newService) createServiceMutation.mutate({ data: { name: newService } }); }}
                  className="flex gap-2 mb-6"
                >
                  <input 
                    value={newService} onChange={e => setNewService(e.target.value)}
                    placeholder="Новая услуга..."
                    className="flex-1 px-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                  <button disabled={createServiceMutation.isPending || !newService} className="px-4 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50">
                    <Plus className="w-5 h-5" />
                  </button>
                </form>
                
                <div className="space-y-2">
                  {services?.map(service => (
                    <div key={service.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="font-medium text-slate-700">{service.name}</span>
                      <button 
                        onClick={() => deleteServiceMutation.mutate({ id: service.id })}
                        className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
